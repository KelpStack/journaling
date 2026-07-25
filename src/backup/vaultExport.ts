import JSZip from "jszip";
import { listEntriesForProfile } from "../db/entriesRepo";
import { getPack } from "../db/packsRepo";
import { fieldsForSectionOnDay } from "../domain/mergePacks";
import { normalizePack, normalizePackPromptDraw } from "../domain/normalizePack";
import { addJournalDays } from "../domain/dates";
import type { ContentPack, DailyEntry, JournalDate, ProfileId } from "../domain/types";
import { serializeYaml } from "./yaml";

export interface VaultExportOptions {
  profileId?: ProfileId;
  rootFolder?: string;
}

function entryFilename(date: JournalDate): string {
  return `${date}.md`;
}

function formatAnswerValue(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const checked = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([id]) => id);
    return checked.length > 0 ? checked.join(", ") : "_None checked._";
  }
  return String(value ?? "");
}

function frontMatterFromEntry(entry: DailyEntry): Record<string, unknown> {
  return {
    date: entry.date,
    profileId: entry.profileId,
    skinId: entry.skinId,
    contentPackIds: entry.contentPackIds,
    completedByPack: entry.completedByPack,
    ...(entry.completedAt ? { completedAt: entry.completedAt } : {}),
    answers: entry.answers.map((a) => ({
      fieldRef: a.fieldRef,
      value: a.value,
    })),
    promptDraw: entry.promptDraw,
    tags: entry.tags,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

async function bodySections(entry: DailyEntry, packs: Map<string, ContentPack>): Promise<string> {
  const prev = addJournalDays(entry.date, -1);
  const next = addJournalDays(entry.date, 1);
  const nav = `[[${prev}]] · [[${next}]]`;

  const parts: string[] = [nav, "", `# ${entry.date}`, ""];

  parts.push("## Free write", "", entry.body.trim() || "_No free write._", "");

  for (const packId of entry.contentPackIds) {
    const rawPack = packs.get(packId);
    if (!rawPack) {
      continue;
    }
    const pack = normalizePack(rawPack);
    parts.push(`## ${pack.name}`, "");
    const draw = normalizePackPromptDraw(pack, entry.promptDraw[packId] as unknown);
    for (const section of pack.sections) {
      parts.push(`### ${section.title}`, "");
      for (const field of fieldsForSectionOnDay(section, draw[section.id])) {
        const ref = `${packId}:${field.id}`;
        const answer = entry.answers.find((a) => a.fieldRef === ref);
        parts.push(`### ${field.label}`, "", formatAnswerValue(answer?.value), "");
      }
    }
  }

  return parts.join("\n").trimEnd() + "\n";
}

export async function entryToMarkdown(entry: DailyEntry): Promise<string> {
  const packs = new Map<string, ContentPack>();
  for (const packId of entry.contentPackIds) {
    const pack = await getPack(packId);
    if (pack) {
      packs.set(packId, pack);
    }
  }

  const yaml = serializeYaml(frontMatterFromEntry(entry));
  const body = await bodySections(entry, packs);
  return `---\n${yaml}\n---\n\n${body}`;
}

export async function exportVaultZip(options: VaultExportOptions = {}): Promise<Blob> {
  const profileId = options.profileId ?? "local";
  const entries = await listEntriesForProfile(profileId);
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const zip = new JSZip();
  const rootName = options.rootFolder ?? "vault";
  const root = zip.folder(rootName)!;

  for (const entry of entries) {
    const markdown = await entryToMarkdown(entry);
    root.file(entryFilename(entry.date), markdown);
  }

  return zip.generateAsync({ type: "blob" });
}

export { entryFilename };
