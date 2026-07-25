import { fieldsForPackOnDay } from "./mergePacks";
import { normalizePack, normalizePackPromptDraw } from "./normalizePack";
import { fieldRef } from "./fieldRef";
import type { ContentPack, DailyEntry, PackSection } from "./types";

export function ensurePromptDraw(
  entry: DailyEntry,
  pack: ContentPack,
  rng: () => number = Math.random,
): { entry: DailyEntry; fieldIds: string[] } {
  const normalized = normalizePack(pack);
  let packDraw = normalizePackPromptDraw(pack, entry.promptDraw[pack.id]);
  let changed = false;

  for (const section of normalized.sections) {
    if (section.promptMode !== "random") continue;
    const existing = packDraw[section.id];
    if (existing && existing.length > 0) continue;

    packDraw = {
      ...packDraw,
      [section.id]: drawFieldIdsForSection(pack.id, section, [], rng),
    };
    changed = true;
  }

  const nextEntry = changed
    ? {
        ...entry,
        promptDraw: {
          ...entry.promptDraw,
          [pack.id]: packDraw,
        },
      }
    : entry;

  const fieldIds = fieldsForPackOnDay(normalized, packDraw).map((f) => f.id);
  return { entry: nextEntry, fieldIds };
}

/**
 * Re-draws random prompts for one section, preferring ids not in the current draw
 * when the pool is large enough. Clears answers for previously drawn fields in that section.
 */
export function redrawPromptDraw(
  entry: DailyEntry,
  pack: ContentPack,
  sectionId: string,
  rng: () => number = Math.random,
): DailyEntry {
  const normalized = normalizePack(pack);
  const section = normalized.sections.find((s) => s.id === sectionId);
  if (!section || section.promptMode !== "random") {
    return entry;
  }

  const packDraw = normalizePackPromptDraw(pack, entry.promptDraw[pack.id]);
  const previous = packDraw[sectionId] ?? [];
  const fieldIds = drawFieldIdsForSection(pack.id, section, previous, rng);
  const dropRefs = new Set(previous.map((id) => fieldRef(pack.id, id)));

  return {
    ...entry,
    promptDraw: {
      ...entry.promptDraw,
      [pack.id]: { ...packDraw, [sectionId]: fieldIds },
    },
    answers: entry.answers.filter((answer) => !dropRefs.has(answer.fieldRef)),
  };
}

function drawFieldIdsForSection(
  packId: string,
  section: PackSection,
  avoid: string[],
  rng: () => number,
): string[] {
  const pool = section.pool ?? section.fields;
  const n = section.drawCount ?? 1;
  if (pool.length < n) {
    throw new Error(`Pool too small for pack ${packId}`);
  }

  const avoidSet = new Set(avoid);
  let ids = pool.map((f) => f.id);
  if (ids.length > n && avoidSet.size > 0) {
    const without = ids.filter((id) => !avoidSet.has(id));
    if (without.length >= n) {
      ids = without;
    }
  }

  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return ids.slice(0, n);
}
