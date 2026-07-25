import { formatMb, MAX_FONT_BYTES, MAX_IMAGE_BYTES } from "../../packs/assetLimits";

export { MAX_FONT_BYTES, MAX_IMAGE_BYTES };

export async function fileToDataUrl(
  file: File,
  maxBytes: number = MAX_IMAGE_BYTES,
): Promise<string> {
  if (file.size > maxBytes) {
    throw new Error(`File must be ${formatMb(maxBytes)}MB or smaller`);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}
