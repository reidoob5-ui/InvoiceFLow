export type Frequency = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

/**
 * Next occurrence after `from`. Month-based frequencies clamp to the last day of the target month
 * (Jan 31 + 1 month = Feb 28/29) and never drift: callers should advance from the *scheduled* date,
 * and pass `anchorDay` (the original day of month) so Feb 28 → Mar 31 rather than Mar 28.
 */
export function nextOccurrence(from: Date, frequency: Frequency, intervalCount = 1, anchorDay?: number): Date {
  const n = Math.max(1, Math.floor(intervalCount));
  if (frequency === "WEEKLY") {
    const d = new Date(from.getTime());
    d.setUTCDate(d.getUTCDate() + 7 * n);
    return d;
  }
  const months = frequency === "MONTHLY" ? n : frequency === "QUARTERLY" ? 3 * n : 12 * n;
  const day = anchorDay ?? from.getUTCDate();
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/** All run dates that are due up to and including `now`, advancing from the scheduled date (catch-up safe). */
export function dueRuns(
  nextRunAt: Date,
  now: Date,
  frequency: Frequency,
  intervalCount: number,
  endsAt?: Date | null,
  limit = 12,
): { runs: Date[]; next: Date } {
  const anchor = nextRunAt.getUTCDate();
  const runs: Date[] = [];
  let cursor = nextRunAt;
  while (cursor.getTime() <= now.getTime() && runs.length < limit) {
    if (endsAt && cursor.getTime() > endsAt.getTime()) break;
    runs.push(cursor);
    cursor = nextOccurrence(cursor, frequency, intervalCount, anchor);
  }
  return { runs, next: cursor };
}
