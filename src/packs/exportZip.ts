import JSZip from "jszip";
import type { CustomAsset, Skin, SkinImages } from "../domain/types";
import { getPack } from "../db/packsRepo";
import { getSkin } from "../db/skinsRepo";
import type { BundleManifest } from "./manifest";

export interface ExportBundleOptions {
  name: string;
  version: string;
  skinIds?: string[];
  contentPackIds?: string[];
  activateOnImport?: BundleManifest["activateOnImport"];
  rootFolder?: string;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function decodeDataUrl(dataUrl: string): { mime: string; bytes: Uint8Array } {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid data URL");
  }

  const mime = match[1] || "application/octet-stream";
  const payload = match[2]!;
  if (dataUrl.includes(";base64,")) {
    const binary =
      typeof Buffer !== "undefined"
        ? Buffer.from(payload, "base64")
        : Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
    return { mime, bytes: binary };
  }

  return { mime, bytes: new TextEncoder().encode(decodeURIComponent(payload)) };
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/svg+xml":
      return "svg";
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "font/woff2":
    case "application/font-woff2":
      return "woff2";
    case "font/woff":
    case "application/font-woff":
      return "woff";
    case "font/ttf":
    case "application/x-font-ttf":
    case "font/truetype":
      return "ttf";
    case "font/otf":
    case "application/x-font-otf":
    case "font/opentype":
      return "otf";
    default:
      return "bin";
  }
}

function serializeDataUrlAsset(
  skinId: string,
  key: string,
  value: string,
  assets: Map<string, Uint8Array>,
  assetIndex: { n: number },
): string {
  if (!value.startsWith("data:")) {
    return value;
  }

  const { mime, bytes } = decodeDataUrl(value);
  const ext = extensionForMime(mime);
  const assetName = `${skinId}-${key}-${assetIndex.n}.${ext}`;
  assetIndex.n += 1;
  const assetPath = `assets/${assetName}`;
  assets.set(assetPath, bytes);
  return assetPath;
}

function serializeSkinImages(
  skinId: string,
  images: SkinImages | undefined,
  assets: Map<string, Uint8Array>,
  assetIndex: { n: number },
): SkinImages | undefined {
  if (!images) {
    return undefined;
  }

  const serialized: SkinImages = {};

  for (const key of ["tilingBackground"] as const) {
    const value = images[key];
    if (!value) {
      continue;
    }
    serialized[key] = serializeDataUrlAsset(skinId, key, value, assets, assetIndex);
  }

  return Object.keys(serialized).length > 0 ? serialized : undefined;
}

function serializeCustomAssets(
  skinId: string,
  customAssets: CustomAsset[] | undefined,
  assets: Map<string, Uint8Array>,
  assetIndex: { n: number },
): CustomAsset[] | undefined {
  if (!customAssets?.length) {
    return undefined;
  }

  return customAssets.map((asset) => ({
    key: asset.key,
    dataUrl: serializeDataUrlAsset(
      skinId,
      `asset-${asset.key}`,
      asset.dataUrl,
      assets,
      assetIndex,
    ),
  }));
}

function serializeSkinFonts(
  skinId: string,
  fonts: Skin["fonts"],
  assets: Map<string, Uint8Array>,
  assetIndex: { n: number },
): Skin["fonts"] {
  if (!fonts) {
    return undefined;
  }

  const serialized: NonNullable<Skin["fonts"]> = {};
  for (const key of ["displayDataUrl", "bodyDataUrl"] as const) {
    const value = fonts[key];
    if (!value) {
      continue;
    }
    serialized[key] = serializeDataUrlAsset(skinId, key, value, assets, assetIndex);
  }

  return Object.keys(serialized).length > 0 ? serialized : undefined;
}

export function bundleZipFilename(name: string, now = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "bundle";
  return `${slug}-${stamp}.zip`;
}

export async function exportBundleZip(options: ExportBundleOptions): Promise<Blob> {
  const zip = new JSZip();
  const rootName = options.rootFolder ?? (slugify(options.name) || "bundle");
  const root = zip.folder(rootName)!;

  const manifest: BundleManifest = {
    name: options.name,
    version: options.version,
  };

  if (options.skinIds?.length) {
    manifest.skinIds = options.skinIds;
  }
  if (options.contentPackIds?.length) {
    manifest.contentPackIds = options.contentPackIds;
  }
  if (options.activateOnImport) {
    manifest.activateOnImport = options.activateOnImport;
  }

  root.file("manifest.json", JSON.stringify(manifest, null, 2));

  for (const skinId of options.skinIds ?? []) {
    const skin = await getSkin(skinId);
    if (!skin) {
      throw new Error(`Skin not found: ${skinId}`);
    }

    const assets = new Map<string, Uint8Array>();
    const assetIndex = { n: 0 };
    const exportedSkin: Skin = {
      ...skin,
      images: serializeSkinImages(skinId, skin.images, assets, assetIndex),
      fonts: serializeSkinFonts(skinId, skin.fonts, assets, assetIndex),
      customAssets: serializeCustomAssets(skinId, skin.customAssets, assets, assetIndex),
    };

    const skinFolder = root.folder("skin")!;
    skinFolder.file(`${skinId}.json`, JSON.stringify(exportedSkin, null, 2));
    for (const [assetPath, bytes] of assets) {
      skinFolder.file(assetPath, bytes);
    }
  }

  for (const packId of options.contentPackIds ?? []) {
    const pack = await getPack(packId);
    if (!pack) {
      throw new Error(`Content pack not found: ${packId}`);
    }
    root.folder("content")!.file(`${packId}.json`, JSON.stringify(pack, null, 2));
  }

  return zip.generateAsync({ type: "blob" });
}
