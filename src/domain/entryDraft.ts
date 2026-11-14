import type { DailyEntry } from "./types";

/** User-edited fields. Completion timestamps are derived and not part of the draft. */
export function entryDraftKey(entry: DailyEntry): string {
  return JSON.stringify({
    body: entry.body,
    answers: entry.answers,
    promptDraw: entry.promptDraw,
    tags: entry.tags,
  });
}

/**
 * A finished save may update on-screen state only when the user is still
 * looking at that day and has not typed (or redrawn) since this draft.
 */
export function canApplySavedEntry(
  viewing: DailyEntry | null,
  source: DailyEntry,
): boolean {
  if (!viewing || viewing.id !== source.id || viewing.date !== source.date) {
    return false;
  }
  return entryDraftKey(viewing) === entryDraftKey(source);
}
