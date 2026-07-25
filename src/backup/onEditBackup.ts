import { getSettings } from "../db/settingsRepo";
import type { ProfileId } from "../domain/types";
import { notifyBackupFailure } from "./backupNotice";
import { runBackup } from "./schedule";

const DEBOUNCE_MS = 5000;

let timer: ReturnType<typeof setTimeout> | null = null;
let pendingProfileId: ProfileId | null = null;

export function queueOnEditBackup(profileId: ProfileId): void {
  pendingProfileId = profileId;

  if (timer) {
    clearTimeout(timer);
  }

  timer = setTimeout(() => {
    timer = null;
    const id = pendingProfileId;
    pendingProfileId = null;
    if (id) {
      void flushOnEditBackup(id);
    }
  }, DEBOUNCE_MS);
}

export function cancelOnEditBackup(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  pendingProfileId = null;
}

async function flushOnEditBackup(profileId: ProfileId): Promise<void> {
  const settings = await getSettings(profileId);
  if (!settings?.backupOnEdit) {
    return;
  }

  const delivery = await runBackup(profileId);
  if (!delivery.ok) {
    notifyBackupFailure();
  }
}
