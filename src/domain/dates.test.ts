import { describe, it, expect } from "vitest";
import { addJournalDays, formatEntryDateDisplay, isJournalDate } from "./dates";

describe("dates", () => {
  it("validates YYYY-MM-DD", () => {
    expect(isJournalDate("2026-07-22")).toBe(true);
    expect(isJournalDate("2026-7-22")).toBe(false);
  });

  it("adds days without UTC shift surprises for fixed local dates", () => {
    expect(addJournalDays("2026-07-22", -1)).toBe("2026-07-21");
    expect(addJournalDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("formats entry dates with full / short / numeric presets", () => {
    expect(formatEntryDateDisplay("2026-07-23")).toBe("Thursday, 23 July 2026");
    expect(formatEntryDateDisplay("2026-07-23", "short")).toBe("Thursday, 23 Jul 2026");
    expect(formatEntryDateDisplay("2026-07-23", "numeric")).toBe("Thursday, 23 07 2026");
  });
});
