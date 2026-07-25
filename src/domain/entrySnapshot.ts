import { ensurePromptDraw } from "./randomDraw";
import { normalizePackPromptDraw } from "./normalizePack";
import type { ContentPack, DailyEntry, PackPromptDraw, ProfileSettings } from "./types";

/** Refresh skin/pack snapshot and keep promptDraw coherent for active packs. */
export function applyEntrySnapshot(
  entry: DailyEntry,
  settings: ProfileSettings,
  activePacks: ContentPack[],
): DailyEntry {
  const activeIds = new Set(settings.activeContentPackIds);
  const packById = new Map(activePacks.map((pack) => [pack.id, pack]));
  const promptDraw: Record<string, PackPromptDraw> = {};

  for (const packId of settings.activeContentPackIds) {
    const pack = packById.get(packId);
    if (!pack) continue;
    const normalized = normalizePackPromptDraw(pack, entry.promptDraw[packId]);
    if (Object.keys(normalized).length > 0) {
      promptDraw[packId] = normalized;
    }
  }

  let next: DailyEntry = {
    ...entry,
    skinId: settings.activeSkinId,
    contentPackIds: [...settings.activeContentPackIds],
    promptDraw,
  };

  for (const pack of activePacks) {
    if (!activeIds.has(pack.id)) {
      continue;
    }
    next = ensurePromptDraw(next, pack).entry;
  }

  return next;
}
