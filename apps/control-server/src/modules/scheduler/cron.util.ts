import { BadRequestException } from '@nestjs/common';
import { CronExpressionParser } from 'cron-parser';

// Computes the next fire time strictly after `from`. Thrown parse errors (bad syntax) are
// translated to a 400 here rather than surfacing cron-parser's raw message shape to callers —
// used both at create/update time (reject a bad expression before it's ever stored) and by the
// timer loop when recomputing a job's next occurrence after it fires.
export function computeNextRunAt(cronExpression: string, from: Date): Date {
  try {
    return CronExpressionParser.parse(cronExpression, { currentDate: from, tz: 'UTC' })
      .next()
      .toDate();
  } catch (err) {
    throw new BadRequestException(
      `Invalid cron expression "${cronExpression}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
