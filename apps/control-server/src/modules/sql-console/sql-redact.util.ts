const SENSITIVE_KEYWORDS = /password|secret|token|api[_-]?key/i;

/**
 * Redacts all string literals in a statement if it mentions a sensitive keyword, before the
 * statement text is written to logs or history (scope.md §5.2: "Avoid logging passwords or
 * secret values"). Coarse on purpose: identifying the exact sensitive literal reliably would
 * need real SQL parsing, so a matching statement has every literal blanked rather than risking
 * a missed one.
 */
export function redactSensitiveSql(sql: string): string {
  if (!SENSITIVE_KEYWORDS.test(sql)) {
    return sql;
  }
  return sql.replace(/'(?:[^']|'')*'/g, "'***'");
}
