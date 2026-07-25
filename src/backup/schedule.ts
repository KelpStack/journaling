import JSZip from "jszip";
import { listEntriesForProfile } from "../db/entriesRepo";
import { getSettings, saveSettings } from "../db/settingsRepo";
import type { ProfileId, ProfileSettings } from "../domain/types";
import { writeBackupToFolder } from "./backupFolder";
import { notifyBackupFailure } from "./backupNotice";
import { downloadBlob } from "./download";
import { buildBackupPayload } from "./jsonExport";
import { entryToMarkdown } from "./vaultExport";

const DAY_MS = 24 * 60 * 60 * 1000;

export function cadencePeriodMs(
  cadence: ProfileSettings["backupCadence"],
): number | null {
  switch (cadence) {
    case "daily":
      return DAY_MS;
    case "weekly":
      return 7 * DAY_MS;
    case "off":
      return null;
  }
}

export function isPastBackupTimeLocal(now: Date, backupTimeLocal: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(backupTimeLocal);
  if (!match) {
    return false;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const scheduled = new Date(now);
  scheduled.setHours(hours, minutes, 0, 0);
  return now.getTime() >= scheduled.getTime();
}

export function isScheduledBackupDue(
  settings: ProfileSettings,
  now = new Date(),
): boolean {
  const period = cadencePeriodMs(settings.backupCadence);
  if (period === null) {
    return false;
  }
  if (!isPastBackupTimeLocal(now, settings.backupTimeLocal)) {
    return false;
  }
  if (!settings.lastBackupAt) {
    return true;
  }

  const elapsed = now.getTime() - new Date(settings.lastBackupAt).getTime();
  return elapsed >= period;
}

export function fullBackupZipFilename(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `journal-backup-${stamp}.zip`;
}

export async function buildFullBackupZip(profileId: ProfileId = "local"): Promise<Blob> {
  const zip = new JSZip();
  const payload = await buildBackupPayload({ profileId });
  zip.file("backup.json", JSON.stringify(payload, null, 2));

  const vault = zip.folder("vault")!;
  const entries = await listEntriesForProfile(profileId);
  entries.sort((a, b) => a.date.localeCompare(b.date));

  for (const entry of entries) {
    const markdown = await entryToMarkdown(entry);
    vault.file(`${entry.date}.md`, markdown);
  }

  return zip.generateAsync({ type: "blob" });
}

export type BackupDeliveryResult =
  | { ok: true; method: "folder" | "share" | "download" }
  | { ok: false; reason: string };

export async function deliverBackupBlob(
  blob: Blob,
  filename: string,
  profileId: ProfileId,
  options?: { allowDownloadFallback?: boolean },
): Promise<BackupDeliveryResult> {
  if (await writeBackupToFolder(profileId, blob, filename)) {
    return { ok: true, method: "folder" };
  }

  if (typeof navigator.share === "function") {
    try {
      const file = new File([blob], filename, { type: "application/zip" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Journal backup" });
        return { ok: true, method: "share" };
      }
    } catch {
      // Share dismissed or failed; fall through to download or failure.
    }
  }

  if (options?.allowDownloadFallback) {
    downloadBlob(blob, filename);
    return { ok: true, method: "download" };
  }

  return { ok: false, reason: "no delivery method available" };
}

export async function runBackup(
  profileId: ProfileId = "local",
  options?: { allowDownloadFallback?: boolean },
): Promise<BackupDeliveryResult> {
  const now = new Date();
  const blob = await buildFullBackupZip(profileId);
  const filename = fullBackupZipFilename(now);
  const delivery = await deliverBackupBlob(blob, filename, profileId, options);

  if (delivery.ok) {
    const settings = await getSettings(profileId);
    if (settings) {
      await saveSettings({
        ...settings,
        lastBackupAt: now.toISOString(),
      });
    }
  }

  return delivery;
}

export async function maybeRunScheduledBackup(
  profileId: ProfileId = "local",
): Promise<boolean> {
  const settings = await getSettings(profileId);
  if (!settings || !isScheduledBackupDue(settings)) {
    return false;
  }

  const delivery = await runBackup(profileId);
  if (!delivery.ok) {
    notifyBackupFailure();
  }
  return true;
}
