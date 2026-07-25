import type { AnswerValue, DailyEntry } from "../domain/types";
import { isChecklistAnswer } from "../domain/completion";
import { db, type SearchRecord } from "./database";

function answerToSearchText(value: AnswerValue): string {
  if (isChecklistAnswer(value)) {
    return Object.entries(value)
      .filter(([, checked]) => checked)
      .map(([id]) => id)
      .join(" ");
  }
  return String(value);
}

export function buildSearchText(entry: DailyEntry): string {
  const parts = [entry.body];
  for (const answer of entry.answers) {
    if (answer.value != null) {
      parts.push(answerToSearchText(answer.value));
    }
  }
  return parts.join(" ").trim();
}

export function buildSearchRecord(entry: DailyEntry): SearchRecord {
  const answers: Record<string, AnswerValue> = {};
  for (const answer of entry.answers) {
    if (answer.value != null) {
      answers[answer.fieldRef] = answer.value;
    }
  }

  return {
    id: entry.id,
    profileId: entry.profileId,
    date: entry.date,
    text: buildSearchText(entry),
    contentPackIds: [...entry.contentPackIds],
    completed: !!entry.completedAt,
    answers,
  };
}

export async function upsertSearchIndex(entry: DailyEntry): Promise<void> {
  await db.search.put(buildSearchRecord(entry));
}

export type SearchCompletionFilter = "all" | "completed" | "draft";

export interface SearchFilters {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
  packId?: string;
  completion?: SearchCompletionFilter;
  yesNoFieldRef?: string;
  yesNoValue?: boolean;
  numberFieldRef?: string;
  numberMin?: number;
  numberMax?: number;
}

export interface SearchResult {
  id: string;
  date: string;
  snippet: string;
  fieldRef?: string;
}

/** True when the entry has at least one stored answer for this pack. */
function packPresentInRecord(record: SearchRecord, packId: string): boolean {
  const prefix = `${packId}:`;
  return Object.keys(record.answers).some((ref) => ref.startsWith(prefix));
}

function matchesQuery(
  record: SearchRecord,
  query: string,
): { matches: boolean; fieldRef?: string } {
  const trimmed = query.trim();
  if (!trimmed) return { matches: true };

  const haystack = record.text.toLowerCase();
  const needle = trimmed.toLowerCase();
  if (!haystack.includes(needle)) return { matches: false };

  for (const [ref, value] of Object.entries(record.answers)) {
    if (String(value).toLowerCase().includes(needle)) {
      return { matches: true, fieldRef: ref };
    }
  }

  return { matches: true };
}

export function matchesSearchFilters(record: SearchRecord, filters: SearchFilters): boolean {
  if (filters.dateFrom && record.date < filters.dateFrom) return false;
  if (filters.dateTo && record.date > filters.dateTo) return false;
  if (filters.packId && !packPresentInRecord(record, filters.packId)) return false;

  const completion = filters.completion ?? "all";
  if (completion === "completed" && !record.completed) return false;
  if (completion === "draft" && record.completed) return false;

  if (filters.yesNoFieldRef !== undefined && filters.yesNoValue !== undefined) {
    if (record.answers[filters.yesNoFieldRef] !== filters.yesNoValue) return false;
  }

  if (filters.numberFieldRef) {
    const value = record.answers[filters.numberFieldRef];
    if (typeof value !== "number" || Number.isNaN(value)) return false;
    if (filters.numberMin !== undefined && value < filters.numberMin) return false;
    if (filters.numberMax !== undefined && value > filters.numberMax) return false;
  }

  return true;
}

export function buildSearchSnippet(record: SearchRecord, query?: string): string {
  const text = record.text;
  if (!text) return "(empty entry)";

  const trimmed = query?.trim();
  if (!trimmed) {
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  }

  const idx = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (idx < 0) {
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  }

  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + trimmed.length + 40);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

export function resolveResultFieldRef(
  filters: SearchFilters,
  queryFieldRef?: string,
): string | undefined {
  if (filters.yesNoFieldRef) return filters.yesNoFieldRef;
  if (filters.numberFieldRef) return filters.numberFieldRef;
  return queryFieldRef;
}

function normalizeSearchRecord(record: SearchRecord): SearchRecord {
  return {
    ...record,
    contentPackIds: record.contentPackIds ?? [],
    answers: record.answers ?? {},
    completed: record.completed ?? false,
  };
}

export async function searchEntries(
  profileId: string,
  filters: SearchFilters,
): Promise<SearchResult[]> {
  const records = await db.search.where("profileId").equals(profileId).toArray();
  const results: SearchResult[] = [];

  for (const raw of records) {
    const record = normalizeSearchRecord(raw);
    if (!matchesSearchFilters(record, filters)) continue;

    const queryMatch = matchesQuery(record, filters.query ?? "");
    if (!queryMatch.matches) continue;

    const fieldRef = resolveResultFieldRef(filters, queryMatch.fieldRef);
    results.push({
      id: record.id,
      date: record.date,
      snippet: buildSearchSnippet(record, filters.query),
      fieldRef,
    });
  }

  return results.sort((a, b) => b.date.localeCompare(a.date));
}
