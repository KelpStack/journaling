import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { DailyEntry, JournalDate } from "./types";

export type DayState = "empty" | "draft" | "completed";

export interface CalendarDayCell {
  date: JournalDate;
  inMonth: boolean;
  state: DayState;
  completedPackIds: string[];
}

export function dayStateFromEntry(
  entry: DailyEntry | undefined,
): { state: DayState; completedPackIds: string[] } {
  if (!entry) {
    return { state: "empty", completedPackIds: [] };
  }

  const completedPackIds = Object.keys(entry.completedByPack);
  if (entry.completedAt) {
    return { state: "completed", completedPackIds };
  }

  return { state: "draft", completedPackIds };
}

export function journalDateFromLocalDate(date: Date): JournalDate {
  return format(date, "yyyy-MM-dd");
}

export function parseJournalDate(date: JournalDate): Date {
  return parse(date, "yyyy-MM-dd", new Date());
}

export function firstOfMonth(date: JournalDate): JournalDate {
  return journalDateFromLocalDate(startOfMonth(parseJournalDate(date)));
}

export function addMonthsToJournalDate(date: JournalDate, delta: number): JournalDate {
  return journalDateFromLocalDate(addMonths(parseJournalDate(date), delta));
}

export function monthLabel(date: JournalDate): string {
  return format(parseJournalDate(date), "MMMM yyyy");
}

export function monthRangeForGrid(monthStart: JournalDate): {
  start: JournalDate;
  end: JournalDate;
} {
  const monthDate = parseJournalDate(monthStart);
  return {
    start: journalDateFromLocalDate(startOfWeek(startOfMonth(monthDate))),
    end: journalDateFromLocalDate(endOfWeek(endOfMonth(monthDate))),
  };
}

export function buildMonthGrid(
  monthStart: JournalDate,
  entriesByDate: Map<JournalDate, DailyEntry>,
): CalendarDayCell[] {
  const monthDate = parseJournalDate(monthStart);
  const gridStart = startOfWeek(startOfMonth(monthDate));
  const gridEnd = endOfWeek(endOfMonth(monthDate));
  const targetMonth = monthDate.getMonth();
  const cells: CalendarDayCell[] = [];

  for (let cursor = gridStart; cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    const date = journalDateFromLocalDate(cursor);
    const { state, completedPackIds } = dayStateFromEntry(entriesByDate.get(date));
    cells.push({
      date,
      inMonth: cursor.getMonth() === targetMonth,
      state,
      completedPackIds,
    });
  }

  return cells;
}
