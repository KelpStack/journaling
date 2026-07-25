/** Shared skin asset size caps (bytes). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FONT_BYTES = 2 * 1024 * 1024;
/** Max number of freeform custom image assets per skin. */
export const MAX_CUSTOM_ASSETS = 6;

export function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb}` : mb.toFixed(1);
}
