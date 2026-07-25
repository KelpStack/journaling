import type { ContentPack, PackField, PackPromptDraw, PackSection } from "./types";
import { normalizePack, normalizePackPromptDraw } from "./normalizePack";
import { fieldRef } from "./fieldRef";

export function shouldHideFreeWrite(packs: ContentPack[]): boolean {
  return packs.some((p) => p.hideFreeWrite);
}

export function fieldsForSectionOnDay(
  section: PackSection,
  drawnFieldIds?: string[],
): PackField[] {
  if (section.promptMode === "random") {
    const pool = section.pool ?? section.fields;
    const ids = drawnFieldIds ?? [];
    return ids
      .map((id) => pool.find((f) => f.id === id))
      .filter((f): f is PackField => !!f);
  }
  return section.fields;
}

export function fieldsForPackOnDay(
  pack: ContentPack,
  packDraw?: PackPromptDraw,
): PackField[] {
  const n = normalizePack(pack);
  const draw = packDraw ?? {};
  return n.sections.flatMap((section) =>
    fieldsForSectionOnDay(section, draw[section.id]),
  );
}

export function mergedFields(
  packs: ContentPack[],
  promptDraw: Record<string, PackPromptDraw>,
): { packId: string; field: PackField; ref: string }[] {
  const out: { packId: string; field: PackField; ref: string }[] = [];
  for (const pack of packs) {
    const normalizedDraw = normalizePackPromptDraw(pack, promptDraw[pack.id]);
    for (const field of fieldsForPackOnDay(pack, normalizedDraw)) {
      out.push({ packId: pack.id, field, ref: fieldRef(pack.id, field.id) });
    }
  }
  return out;
}
