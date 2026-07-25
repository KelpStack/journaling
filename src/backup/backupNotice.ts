const BACKUP_FAILURE_HINT =
  "Automatic backup could not be saved. Use Backup now or choose a backup folder.";

let pendingMessage: string | null = null;
const listeners = new Set<(message: string | null) => void>();

export function notifyBackupFailure(): void {
  pendingMessage = BACKUP_FAILURE_HINT;
  for (const listener of listeners) {
    listener(pendingMessage);
  }
}

export function subscribeBackupNotice(
  listener: (message: string | null) => void,
): () => void {
  listeners.add(listener);
  if (pendingMessage) {
    listener(pendingMessage);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function clearBackupNotice(): void {
  pendingMessage = null;
  for (const listener of listeners) {
    listener(null);
  }
}
