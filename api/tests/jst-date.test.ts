import { describe, it, expect } from "vitest";
import { jstDayInterval, jstYesterday } from "../src/lib/jst-date.js";

describe("jstDayInterval", () => {
  it("maps a JST calendar day to a half-open UTC interval [date-1 15:00Z, date 15:00Z)", () => {
    const { start, end } = jstDayInterval("2026-06-19");
    // JST 2026-06-19 00:00 == UTC 2026-06-18 15:00
    expect(start.toISOString()).toBe("2026-06-18T15:00:00.000Z");
    // JST 2026-06-20 00:00 == UTC 2026-06-19 15:00
    expect(end.toISOString()).toBe("2026-06-19T15:00:00.000Z");
  });

  it("produces an exactly 24h interval", () => {
    const { start, end } = jstDayInterval("2026-01-01");
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });

  it("handles month/year boundaries", () => {
    const { start, end } = jstDayInterval("2026-01-01");
    expect(start.toISOString()).toBe("2025-12-31T15:00:00.000Z");
    expect(end.toISOString()).toBe("2026-01-01T15:00:00.000Z");
  });
});

describe("jstYesterday", () => {
  it("returns the previous JST day for a UTC morning instant", () => {
    // UTC 2026-06-20 00:30 == JST 2026-06-20 09:30 -> yesterday = 2026-06-19
    expect(jstYesterday(new Date("2026-06-20T00:30:00Z"))).toBe("2026-06-19");
  });

  it("treats late-UTC instants as the next JST day", () => {
    // UTC 2026-06-19 15:30 == JST 2026-06-20 00:30 -> yesterday = 2026-06-19
    expect(jstYesterday(new Date("2026-06-19T15:30:00Z"))).toBe("2026-06-19");
  });

  it("treats just-before-JST-midnight instants as the same JST day", () => {
    // UTC 2026-06-19 14:30 == JST 2026-06-19 23:30 -> yesterday = 2026-06-18
    expect(jstYesterday(new Date("2026-06-19T14:30:00Z"))).toBe("2026-06-18");
  });

  it("handles year boundary", () => {
    // UTC 2026-01-01 00:00 == JST 2026-01-01 09:00 -> yesterday = 2025-12-31
    expect(jstYesterday(new Date("2026-01-01T00:00:00Z"))).toBe("2025-12-31");
  });
});
