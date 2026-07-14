export interface SqlStatementSpan {
  /** Raw slice of the original script, including any leading whitespace within the segment. */
  text: string;
  /** Character index in the original script where this segment begins. */
  startOffset: number;
}

/**
 * Splits a SQL script into individual statements on top-level semicolons, tracking each
 * statement's original offset so Postgres error positions can be mapped back to a line/column
 * in the full script. Heuristic, not a real SQL parser (per scope.md §5.2: a perfect SQL parser
 * is unnecessary and unreliable) — it understands string/identifier quoting, dollar-quoting, and
 * comments well enough for typical admin scripts, not every valid Postgres syntax edge case.
 */
export function splitSqlStatements(script: string): SqlStatementSpan[] {
  const spans: SqlStatementSpan[] = [];
  let segmentStart = 0;
  let i = 0;

  const pushSegment = (end: number) => {
    const text = script.slice(segmentStart, end);
    if (text.trim().length > 0) {
      spans.push({ text, startOffset: segmentStart });
    }
  };

  while (i < script.length) {
    const c = script[i];

    if (c === "'" || c === '"') {
      const quote = c;
      i++;
      while (i < script.length) {
        if (script[i] === quote) {
          if (script[i + 1] === quote) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (c === '-' && script[i + 1] === '-') {
      i += 2;
      while (i < script.length && script[i] !== '\n') i++;
      continue;
    }

    if (c === '/' && script[i + 1] === '*') {
      i += 2;
      while (i < script.length && !(script[i] === '*' && script[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (c === '$') {
      const tagMatch = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(script.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const closeIndex = script.indexOf(tag, i + tag.length);
        i = closeIndex === -1 ? script.length : closeIndex + tag.length;
        continue;
      }
    }

    if (c === ';') {
      pushSegment(i);
      segmentStart = i + 1;
      i++;
      continue;
    }

    i++;
  }

  pushSegment(script.length);
  return spans;
}

/** Maps a 0-based character index in `script` to a 1-based line/column. */
export function locateInScript(script: string, absoluteIndex: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  const end = Math.min(absoluteIndex, script.length);
  for (let i = 0; i < end; i++) {
    if (script[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}
