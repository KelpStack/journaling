import { listEntriesForProfile } from "../db/entriesRepo";
import { listPacks } from "../db/packsRepo";
import { getSettings } from "../db/settingsRepo";
import { listSkins } from "../db/skinsRepo";
import type {
  ContentPack,
  DailyEntry,
  ProfileId,
  ProfileSettings,
  Skin,
} from "../domain/types";
import { encryptString } from "./crypto";

export const BACKUP_VERSION = 1;

export interface JournalBackupPayload {
  v: typeof BACKUP_VERSION;
  exportedAt: string;
  profileId: ProfileId;
  entries: DailyEntry[];
  packs: ContentPack[];
  skins: Skin[];
  settings: ProfileSettings | null;
}

export interface JsonExportOptions {
  profileId?: ProfileId;
  passphrase?: string;
  exportedAt?: string;
}

export function isJournalBackupPayload(value: unknown): value is JournalBackupPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    row.v === BACKUP_VERSION &&
    typeof row.profileId === "string" &&
    Array.isArray(row.entries) &&
    Array.isArray(row.packs) &&
    Array.isArray(row.skins) &&
    ("settings" in row)
  );
}

export async function buildBackupPayload(
  options: JsonExportOptions = {},
): Promise<JournalBackupPayload> {
  const profileId = options.profileId ?? "local";
  const entries = await listEntriesForProfile(profileId);
  entries.sort((a, b) => a.date.localeCompare(b.date));

  return {
    v: BACKUP_VERSION,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    profileId,
    entries,
    packs: await listPacks(),
    skins: await listSkins(),
    settings: (await getSettings(profileId)) ?? null,
  };
}

export async function exportJsonBackup(options: JsonExportOptions = {}): Promise<string> {
  const payload = await buildBackupPayload(options);
  const plaintext = JSON.stringify(payload, null, 2);

  if (options.passphrase) {
    const envelope = await encryptString(plaintext, options.passphrase);
    return JSON.stringify(envelope, null, 2);
  }

  return plaintext;
}

export function jsonBackupFilename(encrypted: boolean, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return encrypted ? `journal-backup-${stamp}.encrypted.json` : `journal-backup-${stamp}.json`;
}
