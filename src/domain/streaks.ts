import { addJournalDays, sameLocalCalendarDay } from "./dates";
import type { DailyEntry } from "./types";

export interface StreakOptions {
  asOf: string;
  backdateRepairsStreak: boolean;
}

export interface StreakResult {
  current: number;
  longest: number;
}

function overallCounts(entry: DailyEntry, backdateRepairsStreak: boolean): boolean {
  if (!entry.completedAt) return false;
  if (backdateRepairsStreak) return true;
  return sameLocalCalendarDay(entry.completedAt, entry.date);
}

function packCounts(entry: DailyEntry, packId: string, backdateRepairsStreak: boolean): boolean {
  const completedAt = entry.completedByPack[packId];
  if (!completedAt) return false;
  if (backdateRepairsStreak) return true;
  return sameLocalCalendarDay(completedAt, entry.date);
}

function countingDates(
  entries: DailyEntry[],
  counts: (entry: DailyEntry) => boolean,
): Set<string> {
  const dates = new Set<string>();
  for (const entry of entries) {
    if (counts(entry)) dates.add(entry.date);
  }
  return dates;
}

function computeCurrent(counting: Set<string>, asOf: string): number {
  let current = 0;
  let date = asOf;
  while (counting.has(date)) {
    current++;
    date = addJournalDays(date, -1);
  }
  return current;
}

function computeLongest(counting: Set<string>): number {
  if (counting.size === 0) return 0;

  const sorted = [...counting].sort();
  let longest = 1;
  let run = 1;

  for (let i = 1; i < sorted.length; i++) {
    if (addJournalDays(sorted[i - 1]!, 1) === sorted[i]) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  return longest;
}

function computeStreak(
  entries: DailyEntry[],
  counts: (entry: DailyEntry) => boolean,
  asOf: string,
): StreakResult {
  const counting = countingDates(entries, counts);
  return {
    current: computeCurrent(counting, asOf),
    longest: computeLongest(counting),
  };
}

export function computeOverallStreak(
  entries: DailyEntry[],
  opts: StreakOptions,
): StreakResult {
  return computeStreak(
    entries,
    (entry) => overallCounts(entry, opts.backdateRepairsStreak),
    opts.asOf,
  );
}

export function computePackStreak(
  entries: DailyEntry[],
  packId: string,
  opts: StreakOptions,
): StreakResult {
  return computeStreak(
    entries,
    (entry) => packCounts(entry, packId, opts.backdateRepairsStreak),
    opts.asOf,
  );
}

export function computePreferredAnswerStreak(
  entries: DailyEntry[],
  ref: string,
  preferred: "yes" | "no",
  asOf: string,
): StreakResult {
  const want = preferred === "yes";
  return computeStreak(
    entries,
    (entry) => {
      const value = entry.answers.find((a) => a.fieldRef === ref)?.value;
      return typeof value === "boolean" && value === want;
    },
    asOf,
  );
}

export function countDaysJournaled(entries: DailyEntry[]): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.completedAt) count++;
  }
  return count;
}
