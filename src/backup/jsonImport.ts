import { db } from "../db/database";
import { upsertSearchIndex } from "../db/searchIndex";
import { putPack } from "../db/packsRepo";
import { saveSettings } from "../db/settingsRepo";
import { putSkin } from "../db/skinsRepo";
import type { DailyEntry, JournalDate, ProfileId, ProfileSettings } from "../domain/types";
import { decryptString, isEncryptedEnvelope } from "./crypto";
import { isJournalBackupPayload, type JournalBackupPayload } from "./jsonExport";

export interface JsonImportOptions {
  profileId?: ProfileId;
  passphrase?: string;
  forceOverwrite?: Set<JournalDate> | JournalDate[];
}

export interface JsonImportResult {
  entriesImported: number;
  entriesSkipped: number;
  packsImported: number;
  skinsImported: number;
  settingsImported: boolean;
  errors: string[];
}

function isForcedOverwrite(
  forceOverwrite: JsonImportOptions["forceOverwrite"],
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
  forceOverwrite: JsonImportOptions["forceOverwrite"],
): boolean {
  if (!existing) {
    return true;
  }
  if (isForcedOverwrite(forceOverwrite, imported.date)) {
    return true;
  }
  return imported.updatedAt > existing.updatedAt;
}

function remapEntryProfile(entry: DailyEntry, profileId: ProfileId): DailyEntry {
  return {
    ...entry,
    profileId,
    id: `${profileId}:${entry.date}`,
  };
}

export async function parseJsonBackup(
  raw: string,
  passphrase?: string,
): Promise<JournalBackupPayload> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON backup file");
  }

  if (isEncryptedEnvelope(parsed)) {
    if (!passphrase) {
      throw new Error("Passphrase required for encrypted backup");
    }
    const plaintext = await decryptString(parsed, passphrase);
    try {
      parsed = JSON.parse(plaintext);
    } catch {
      throw new Error("Decrypted backup is not valid JSON");
    }
  }

  if (!isJournalBackupPayload(parsed)) {
    throw new Error("Unrecognized backup format");
  }

  return parsed;
}

export async function importJsonBackup(
  raw: string,
  options: JsonImportOptions = {},
): Promise<JsonImportResult> {
  const profileId = options.profileId ?? "local";
  const payload = await parseJsonBackup(raw, options.passphrase);
  const errors: string[] = [];

  let packsImported = 0;
  for (const pack of payload.packs) {
    try {
      await putPack(pack);
      packsImported += 1;
    } catch (error) {
      errors.push(
        `pack ${pack.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  let skinsImported = 0;
  for (const skin of payload.skins) {
    try {
      await putSkin(skin);
      skinsImported += 1;
    } catch (error) {
      errors.push(
        `skin ${skin.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  let settingsImported = false;
  if (payload.settings) {
    const settings: ProfileSettings = {
      ...payload.settings,
      profileId,
    };
    await saveSettings(settings);
    settingsImported = true;
  }

  let entriesImported = 0;
  let entriesSkipped = 0;
  for (const sourceEntry of payload.entries) {
    const entry = remapEntryProfile(sourceEntry, profileId);
    const existing = await db.entries.get(entry.id);
    if (!shouldImportEntry(existing, entry, options.forceOverwrite)) {
      entriesSkipped += 1;
      continue;
    }

    try {
      await db.entries.put(entry);
      await upsertSearchIndex(entry);
      entriesImported += 1;
    } catch (error) {
      errors.push(
        `entry ${entry.date}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    entriesImported,
    entriesSkipped,
    packsImported,
    skinsImported,
    settingsImported,
    errors,
  };
}
