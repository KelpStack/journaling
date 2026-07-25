import JSZip from "jszip";
import { db } from "../db/database";
import { getPack } from "../db/packsRepo";
import { upsertSearchIndex } from "../db/searchIndex";
import { isJournalDate } from "../domain/dates";
import { normalizePackPromptDraw } from "../domain/normalizePack";
import type {
  ContentPack,
  DailyEntry,
  FieldAnswer,
  JournalDate,
  PackPromptDraw,
  ProfileId,
} from "../domain/types";
import { splitFrontMatter } from "./yaml";

const JOURNAL_FILE_RE = /(^|\/)(\d{4}-\d{2}-\d{2})\.md$/;

export interface VaultImportConflict {
  date: JournalDate;
  existingUpdatedAt: string;
  importedUpdatedAt: string;
  /** Which side wins with default policy (newer updatedAt). */
  winner: "existing" | "imported";
}

export interface VaultImportError {
  path: string;
  message: string;
}

export interface VaultImportPreview {
  conflicts: VaultImportConflict[];
  newEntries: JournalDate[];
  unchanged: JournalDate[];
  errors: VaultImportError[];
  totalFiles: number;
}

export interface VaultImportOptions {
  profileId?: ProfileId;
  /** Dates where imported entry always wins regardless of updatedAt. */
  forceOverwrite?: Set<JournalDate> | JournalDate[];
}

export interface VaultImportResult {
  imported: number;
  skipped: number;
  rejected: number;
  errors: VaultImportError[];
  entries: DailyEntry[];
}

function normalizeZipInput(
  data: ArrayBuffer | Blob | JSZip | Uint8Array,
): Promise<JSZip> {
  if (data instanceof JSZip) {
    return Promise.resolve(data);
  }
  const zip = new JSZip();
  if (data instanceof Blob) {
    return data.arrayBuffer().then((buffer) => zip.loadAsync(buffer));
  }
  if (data instanceof Uint8Array) {
    return zip.loadAsync(data);
  }
  return zip.loadAsync(data);
}

function journalDateFromPath(path: string): JournalDate | null {
  const match = JOURNAL_FILE_RE.exec(path);
  if (!match) {
    return null;
  }
  const date = match[2]!;
  return isJournalDate(date) ? date : null;
}

function parseAnswers(raw: unknown): FieldAnswer[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const answers: FieldAnswer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    if (typeof row.fieldRef !== "string") {
      continue;
    }
    answers.push({
      fieldRef: row.fieldRef,
      value: (row.value ?? null) as FieldAnswer["value"],
    });
  }
  return answers;
}

function parseStringMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((v): v is string => typeof v === "string");
}

function isSectionKeyedDraw(raw: unknown): raw is Record<string, string[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return false;
  }
  return Object.values(raw).every(
    (value) => Array.isArray(value) && value.every((v) => typeof v === "string"),
  );
}

function promptDrawWithoutPack(raw: unknown): PackPromptDraw {
  if (Array.isArray(raw)) {
    return { main: parseStringArray(raw) };
  }
  if (isSectionKeyedDraw(raw)) {
    return { ...raw };
  }
  return {};
}

function finalizePromptDraw(raw: unknown, pack?: ContentPack): PackPromptDraw {
  if (pack) {
    return normalizePackPromptDraw(pack, raw);
  }
  return promptDrawWithoutPack(raw);
}

function parsePromptDraw(raw: unknown): Record<string, PackPromptDraw> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, PackPromptDraw> = {};
  for (const [packId, value] of Object.entries(raw)) {
    out[packId] = promptDrawWithoutPack(value);
  }
  return out;
}

async function normalizeEntryPromptDraw(
  contentPackIds: string[],
  promptDraw: Record<string, PackPromptDraw>,
  rawPromptDraw: unknown,
): Promise<Record<string, PackPromptDraw>> {
  if (!rawPromptDraw || typeof rawPromptDraw !== "object" || Array.isArray(rawPromptDraw)) {
    return promptDraw;
  }
  const rawByPack = rawPromptDraw as Record<string, unknown>;
  const out = { ...promptDraw };
  for (const packId of contentPackIds) {
    const raw = rawByPack[packId];
    if (raw === undefined) {
      continue;
    }
    const pack = await getPack(packId);
    out[packId] = finalizePromptDraw(raw, pack);
  }
  return out;
}

function extractFreeWrite(body: string): string {
  const match = /## Free write\r?\n([\s\S]*?)(?:\r?\n## |\s*$)/u.exec(body);
  if (!match) {
    return body.trim();
  }
  const text = match[1]!.trim();
  return text === "_No free write._" ? "" : text;
}

export function parseVaultMarkdown(
  markdown: string,
  fallbackProfileId: ProfileId = "local",
): DailyEntry {
  const { frontMatter, body } = splitFrontMatter(markdown);

  const date = typeof frontMatter.date === "string" ? frontMatter.date : "";
  if (!isJournalDate(date)) {
    throw new Error(`Invalid journal date in front matter: ${date}`);
  }

  const profileId =
    typeof frontMatter.profileId === "string" ? frontMatter.profileId : fallbackProfileId;

  const createdAt =
    typeof frontMatter.createdAt === "string"
      ? frontMatter.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof frontMatter.updatedAt === "string"
      ? frontMatter.updatedAt
      : createdAt;

  const contentPackIds = parseStringArray(frontMatter.contentPackIds);

  return {
    id: `${profileId}:${date}`,
    profileId,
    date,
    body: extractFreeWrite(body),
    answers: parseAnswers(frontMatter.answers),
    completedByPack: parseStringMap(frontMatter.completedByPack),
    completedAt:
      typeof frontMatter.completedAt === "string" ? frontMatter.completedAt : undefined,
    skinId: typeof frontMatter.skinId === "string" ? frontMatter.skinId : "",
    contentPackIds,
    promptDraw: parsePromptDraw(frontMatter.promptDraw),
    tags: parseStringArray(frontMatter.tags),
    createdAt,
    updatedAt,
  };
}

async function listVaultMarkdownFiles(zip: JSZip): Promise<{ path: string; date: JournalDate }[]> {
  const files: { path: string; date: JournalDate }[] = [];
  for (const path of Object.keys(zip.files)) {
    const file = zip.files[path];
    if (!file || file.dir) {
      continue;
    }
    const date = journalDateFromPath(path);
    if (date) {
      files.push({ path, date });
    }
  }
  files.sort((a, b) => a.date.localeCompare(b.date));
  return files;
}

async function loadEntriesFromZip(
  zip: JSZip,
  profileId: ProfileId,
): Promise<{ entries: DailyEntry[]; errors: VaultImportError[] }> {
  const files = await listVaultMarkdownFiles(zip);
  const entries: DailyEntry[] = [];
  const errors: VaultImportError[] = [];
  for (const { path, date } of files) {
    const file = zip.file(path);
    if (!file) {
      continue;
    }
    const markdown = await file.async("string");
    try {
      const parsed = parseVaultMarkdown(markdown, profileId);
      if (parsed.date !== date) {
        errors.push({
          path,
          message: `Filename date ${date} does not match front matter date ${parsed.date}`,
        });
        continue;
      }
      const { frontMatter } = splitFrontMatter(markdown);
      const promptDraw = await normalizeEntryPromptDraw(
        parsed.contentPackIds,
        parsed.promptDraw,
        frontMatter.promptDraw,
      );
      entries.push({
        ...parsed,
        promptDraw,
        profileId,
        id: `${profileId}:${parsed.date}`,
      });
    } catch (error) {
      errors.push({
        path,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { entries, errors };
}

function isForcedOverwrite(
  forceOverwrite: VaultImportOptions["forceOverwrite"],
  date: JournalDate,
): boolean {
  if (!forceOverwrite) {
    return false;
  }
  if (forceOverwrite instanceof Set) {
    return forceOverwrite.has(date);
  }
  return forceOverwrite.includes(date);
}

function shouldImportEntry(
  existing: DailyEntry | undefined,
  imported: DailyEntry,
  forceOverwrite: VaultImportOptions["forceOverwrite"],
): boolean {
  if (!existing) {
    return true;
  }
  if (isForcedOverwrite(forceOverwrite, imported.date)) {
    return true;
  }
  return imported.updatedAt > existing.updatedAt;
}

export async function previewVaultImport(
  data: ArrayBuffer | Blob | JSZip | Uint8Array,
  profileId: ProfileId = "local",
): Promise<VaultImportPreview> {
  const zip = await normalizeZipInput(data);
  const { entries: importedEntries, errors } = await loadEntriesFromZip(zip, profileId);

  const conflicts: VaultImportConflict[] = [];
  const newEntries: JournalDate[] = [];
  const unchanged: JournalDate[] = [];

  for (const imported of importedEntries) {
    const existing = await db.entries.get(imported.id);
    if (!existing) {
      newEntries.push(imported.date);
      continue;
    }

    if (existing.updatedAt === imported.updatedAt) {
      unchanged.push(imported.date);
      continue;
    }

    const winner =
      imported.updatedAt > existing.updatedAt ? "imported" : "existing";
    conflicts.push({
      date: imported.date,
      existingUpdatedAt: existing.updatedAt,
      importedUpdatedAt: imported.updatedAt,
      winner,
    });
  }

  return {
    conflicts,
    newEntries,
    unchanged,
    errors,
    totalFiles: importedEntries.length + errors.length,
  };
}

export async function importVaultZip(
  data: ArrayBuffer | Blob | JSZip | Uint8Array,
  options: VaultImportOptions = {},
): Promise<VaultImportResult> {
  const profileId = options.profileId ?? "local";
  const zip = await normalizeZipInput(data);
  const { entries: importedEntries, errors } = await loadEntriesFromZip(zip, profileId);

  let imported = 0;
  let skipped = 0;
  const saved: DailyEntry[] = [];

  for (const entry of importedEntries) {
    const existing = await db.entries.get(entry.id);
    if (!shouldImportEntry(existing, entry, options.forceOverwrite)) {
      skipped += 1;
      continue;
    }

    await db.entries.put(entry);
    await upsertSearchIndex(entry);
    saved.push(entry);
    imported += 1;
  }

  return {
    imported,
    skipped,
    rejected: errors.length,
    errors,
    entries: saved,
  };
}
