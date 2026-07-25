import type { DailyEntry, JournalDate, ProfileId } from "../domain/types";
import { entryHasUserContent } from "../domain/completion";
import { db } from "./database";
import { upsertSearchIndex } from "./searchIndex";
import { getSettings } from "./settingsRepo";

function entryId(profileId: ProfileId, date: JournalDate): string {
  return `${profileId}:${date}`;
}

function buildEmptyEntry(profileId: ProfileId, date: JournalDate): DailyEntry {
  const now = new Date().toISOString();
  return {
    id: entryId(profileId, date),
    profileId,
    date,
    body: "",
    answers: [],
    completedByPack: {},
    skinId: "",
    contentPackIds: [],
    promptDraw: {},
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Returns the stored entry, or an in-memory empty draft (not written to the DB). */
export async function getOrCreateEntry(
  profileId: ProfileId,
  date: JournalDate,
): Promise<DailyEntry> {
  const id = entryId(profileId, date);
  const existing = await db.entries.get(id);
  if (existing) {
    return existing;
  }

  const settings = await getSettings(profileId);
  return {
    ...buildEmptyEntry(profileId, date),
    skinId: settings?.activeSkinId ?? "",
    contentPackIds: settings?.activeContentPackIds ?? [],
  };
}

export async function deleteEntry(
  profileId: ProfileId,
  date: JournalDate,
): Promise<void> {
  const id = entryId(profileId, date);
  await db.entries.delete(id);
  await db.search.delete(id);
}

/**
 * Persists an entry only when it has user content. Empty drafts are removed
 * from the DB (and never inserted) so the calendar stays clean.
 */
export async function upsertEntry(entry: DailyEntry): Promise<void> {
  if (!entryHasUserContent(entry)) {
    await deleteEntry(entry.profileId, entry.date);
    return;
  }

  const updated: DailyEntry = {
    ...entry,
    updatedAt: new Date().toISOString(),
  };
  await db.entries.put(updated);
  await upsertSearchIndex(updated);
}

export async function listEntriesInRange(
  profileId: ProfileId,
  startDate: JournalDate,
  endDate: JournalDate,
): Promise<DailyEntry[]> {
  return db.entries
    .where("[profileId+date]")
    .between([profileId, startDate], [profileId, endDate], true, true)
    .toArray();
}

export async function listEntriesForProfile(
  profileId: ProfileId,
): Promise<DailyEntry[]> {
  return db.entries.where("profileId").equals(profileId).toArray();
}
