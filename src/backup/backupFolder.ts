import type { ProfileId } from "../domain/types";
import { db, type BackupFolderRecord } from "../db/database";

export type { BackupFolderRecord };

export function supportsFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function getStoredBackupFolderHandle(
  profileId: ProfileId,
): Promise<FileSystemDirectoryHandle | undefined> {
  const record = await db.backupFolders.get(profileId);
  return record?.handle;
}

export async function storeBackupFolderHandle(
  profileId: ProfileId,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  await db.backupFolders.put({ profileId, handle });
}

export async function clearBackupFolderHandle(profileId: ProfileId): Promise<void> {
  await db.backupFolders.delete(profileId);
}

async function ensureFolderPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const current = await handle.queryPermission({ mode: "readwrite" });
  if (current === "granted") {
    return true;
  }
  const requested = await handle.requestPermission({ mode: "readwrite" });
  return requested === "granted";
}

export async function writeBackupToFolder(
  profileId: ProfileId,
  blob: Blob,
  filename: string,
): Promise<boolean> {
  const handle = await getStoredBackupFolderHandle(profileId);
  if (!handle) {
    return false;
  }

  if (!(await ensureFolderPermission(handle))) {
    return false;
  }

  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}

export async function pickAndStoreBackupFolder(profileId: ProfileId): Promise<boolean> {
  if (!supportsFileSystemAccess()) {
    return false;
  }

  const handle = await window.showDirectoryPicker({ mode: "readwrite" });
  await storeBackupFolderHandle(profileId, handle);
  return true;
}
