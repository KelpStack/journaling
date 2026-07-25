import { addDays, format, parse } from "date-fns";

const RE = /^\d{4}-\d{2}-\d{2}$/;

/** Display presets for the entry-page date heading. */
export type EntryDateFormat = "full" | "short" | "numeric";

const ENTRY_DATE_FORMAT_TOKENS: Record<EntryDateFormat, string> = {
  full: "EEEE, dd MMMM yyyy",
  short: "EEEE, dd MMM yyyy",
  numeric: "EEEE, dd MM yyyy",
};

export function isJournalDate(s: string): boolean {
  if (!RE.test(s)) return false;
  const d = parse(s, "yyyy-MM-dd", new Date());
  return format(d, "yyyy-MM-dd") === s;
}

export function todayJournalDate(now = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

export function addJournalDays(date: string, delta: number): string {
  const d = parse(date, "yyyy-MM-dd", new Date());
  return format(addDays(d, delta), "yyyy-MM-dd");
}

export function sameLocalCalendarDay(isoTimestamp: string, journalDate: string): boolean {
  return format(new Date(isoTimestamp), "yyyy-MM-dd") === journalDate;
}

export function formatEntryDateDisplay(
  journalDate: string,
  dateFormat: EntryDateFormat = "full",
): string {
  const d = parse(journalDate, "yyyy-MM-dd", new Date());
  return format(d, ENTRY_DATE_FORMAT_TOKENS[dateFormat]);
}
