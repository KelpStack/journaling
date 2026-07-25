import type { ContentPack, PackField, PackPromptDraw, PackSection } from "./types";

export function normalizePack(pack: ContentPack): ContentPack {
  if (pack.sections && pack.sections.length > 0) {
    return { ...pack, sections: pack.sections };
  }
  const fields = pack.fields ?? [];
  const section: PackSection = {
    id: "main",
    title: pack.name || "Prompts",
    promptMode: pack.promptMode ?? "fixed",
    fields,
    ...(pack.pool ? { pool: pack.pool } : {}),
    ...(pack.drawCount != null ? { drawCount: pack.drawCount } : {}),
  };
  return { ...pack, sections: [section] };
}

export function allPackFields(pack: ContentPack): PackField[] {
  const n = normalizePack(pack);
  const out: PackField[] = [];
  const seen = new Set<string>();
  for (const section of n.sections) {
    const list =
      section.promptMode === "random"
        ? section.pool ?? section.fields
        : section.fields;
    for (const field of list) {
      if (seen.has(field.id)) continue;
      seen.add(field.id);
      out.push(field);
    }
    for (const field of section.fields) {
      if (seen.has(field.id)) continue;
      seen.add(field.id);
      out.push(field);
    }
  }
  return out;
}

export function normalizePackPromptDraw(
  pack: ContentPack,
  raw: unknown,
): PackPromptDraw {
  const n = normalizePack(pack);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const entries = Object.entries(raw as Record<string, unknown>).filter(
      ([, value]) => Array.isArray(value) && value.every((v) => typeof v === "string"),
    ) as [string, string[]][];
    if (
      entries.length === 1 &&
      entries[0]![0] === "main" &&
      !n.sections.some((s) => s.id === "main")
    ) {
      const target =
        n.sections.find((s) => s.promptMode === "random") ?? n.sections[0];
      if (target) {
        return { [target.id]: entries[0]![1] };
      }
    }
    const out: PackPromptDraw = {};
    for (const [key, value] of entries) {
      out[key] = value;
    }
    return out;
  }
  if (Array.isArray(raw) && raw.every((v) => typeof v === "string")) {
    const target =
      n.sections.find((s) => s.promptMode === "random") ?? n.sections[0];
    if (!target) return {};
    return { [target.id]: raw as string[] };
  }
  return {};
}
