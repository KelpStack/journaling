/** Trigger a browser download for a Blob (vault/backup exports). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function vaultZipFilename(now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `journal-vault-${stamp}.zip`;
}
