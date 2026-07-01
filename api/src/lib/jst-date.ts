// JST (Asia/Tokyo, UTC+9, no DST) calendar-day helpers.
// Timestamps are stored as TIMESTAMPTZ in UTC; these helpers translate between
// a JST calendar date (YYYY-MM-DD) and the corresponding UTC instants.

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 86_400_000;

export interface DayInterval {
  start: Date;
  end: Date;
}

/**
 * Half-open UTC interval `[start, end)` covering the JST calendar day `date`.
 * Example: "2026-06-19" -> [2026-06-18T15:00Z, 2026-06-19T15:00Z).
 */
export function jstDayInterval(date: string): DayInterval {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + MS_PER_DAY);
  return { start, end };
}

/**
 * JST calendar date (YYYY-MM-DD) of the day before `now` in JST.
 * Used to default the digest source range to "前日" (yesterday in JST).
 */
export function jstYesterday(now: Date): string {
  // Shift into JST so UTC getters read the JST calendar date.
  const jstShifted = new Date(now.getTime() + JST_OFFSET_MS);
  const prev = new Date(
    Date.UTC(jstShifted.getUTCFullYear(), jstShifted.getUTCMonth(), jstShifted.getUTCDate()) -
      MS_PER_DAY,
  );
  const year = prev.getUTCFullYear();
  const month = String(prev.getUTCMonth() + 1).padStart(2, "0");
  const day = String(prev.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
