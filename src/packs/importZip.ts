import JSZip from "jszip";
import type {
  ContentPack,
  CustomAsset,
  ProfileId,
  Skin,
  SkinFonts,
  SkinImages,
} from "../domain/types";
import { putPack } from "../db/packsRepo";
import { putSkin } from "../db/skinsRepo";
import { getSettings, saveSettings } from "../db/settingsRepo";
import { formatMb, MAX_FONT_BYTES, MAX_IMAGE_BYTES } from "./assetLimits";
import { parseBundleManifest, type BundleManifest } from "./manifest";

export interface ImportBundleOptions {
  profileId?: ProfileId;
  applyActivation?: boolean;
}

export interface ImportBundleResult {
  manifest: BundleManifest;
  skins: Skin[];
  packs: ContentPack[];
}

function normalizeZipInput(
  data: ArrayBuffer | Blob | JSZip | Uint8Array,
): Promise<JSZip> {
  if (data instanceof JSZip) {
    return Promise.resolve(data);
  }
  const zip = new JSZip();
  if (data instanceof Blob) {
    return data.arrayBuffer().then((buffer) => zip.loadAsync(buffer));
  }
  if (data instanceof Uint8Array) {
    return zip.loadAsync(data);
  }
  return zip.loadAsync(data);
}

function findManifestPath(files: JSZip): string {
  const paths = Object.keys(files.files).filter(
    (path) => path.endsWith("manifest.json") && !files.files[path].dir,
  );
  if (paths.length === 0) {
    throw new Error("Bundle zip missing manifest.json");
  }
  paths.sort((a, b) => a.split("/").length - b.split("/").length);
  return paths[0]!;
}

function bundleRootFromManifestPath(manifestPath: string): string {
  const parts = manifestPath.split("/");
  parts.pop();
  return parts.length > 0 ? `${parts.join("/")}/` : "";
}

function joinBundlePath(root: string, ...segments: string[]): string {
  return `${root}${segments.join("/")}`;
}

function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "woff2":
      return "font/woff2";
    case "woff":
      return "font/woff";
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    default:
      return "application/octet-stream";
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadAssetDataUrl(
  zip: JSZip,
  skinRoot: string,
  value: string,
  maxBytes: number,
): Promise<string> {
  if (isDataUrl(value)) {
    return value;
  }

  const assetPath = joinBundlePath(skinRoot, value);
  const file = zip.file(assetPath);
  if (!file) {
    throw new Error(`Missing skin asset: ${value}`);
  }

  const bytes = await file.async("uint8array");
  if (bytes.byteLength > maxBytes) {
    throw new Error(
      `Skin asset exceeds ${formatMb(maxBytes)}MB: ${value}`,
    );
  }

  const mime = mimeFromPath(value);
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

async function resolveSkinImages(
  zip: JSZip,
  skinRoot: string,
  images: SkinImages | undefined,
): Promise<SkinImages | undefined> {
  if (!images) {
    return undefined;
  }

  const resolved: SkinImages = {};
  for (const key of ["tilingBackground"] as const) {
    const value = images[key];
    if (value) {
      resolved[key] = await loadAssetDataUrl(zip, skinRoot, value, MAX_IMAGE_BYTES);
    }
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

async function resolveCustomAssets(
  zip: JSZip,
  skinRoot: string,
  customAssets: CustomAsset[] | undefined,
): Promise<CustomAsset[] | undefined> {
  if (!customAssets?.length) {
    return undefined;
  }

  const resolved: CustomAsset[] = [];
  for (const asset of customAssets) {
    resolved.push({
      key: asset.key,
      dataUrl: await loadAssetDataUrl(zip, skinRoot, asset.dataUrl, MAX_IMAGE_BYTES),
    });
  }
  return resolved;
}

async function resolveSkinFonts(
  zip: JSZip,
  skinRoot: string,
  fonts: SkinFonts | undefined,
): Promise<SkinFonts | undefined> {
  if (!fonts) {
    return undefined;
  }

  const resolved: SkinFonts = {};
  for (const key of ["displayDataUrl", "bodyDataUrl"] as const) {
    const value = fonts[key];
    if (value) {
      // Fonts may be stored as path in export or already as data URL
      resolved[key] = await loadAssetDataUrl(zip, skinRoot, value, MAX_FONT_BYTES);
    }
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined;
}

function parseContentPack(raw: unknown): ContentPack {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid content pack JSON");
  }
  const pack = raw as ContentPack;
  if (typeof pack.id !== "string" || typeof pack.name !== "string") {
    throw new Error("Content pack missing id or name");
  }
  if (
    (!Array.isArray(pack.sections) || pack.sections.length === 0) &&
    !Array.isArray(pack.fields)
  ) {
    throw new Error(`Content pack ${pack.id} missing fields or sections`);
  }
  return pack;
}

function parseSkin(raw: unknown): Skin {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid skin JSON");
  }
  const skin = raw as Skin;
  if (typeof skin.id !== "string" || typeof skin.name !== "string") {
    throw new Error("Skin missing id or name");
  }
  if (!skin.tokens || typeof skin.tokens !== "object") {
    throw new Error(`Skin ${skin.id} missing tokens`);
  }
  return skin;
}

async function loadSkin(
  zip: JSZip,
  root: string,
  skinId: string,
): Promise<Skin> {
  const skinPath = joinBundlePath(root, "skin", `${skinId}.json`);
  const file = zip.file(skinPath);
  if (!file) {
    throw new Error(`Missing skin file: skin/${skinId}.json`);
  }

  const raw = JSON.parse(await file.async("string")) as unknown;
  const skin = parseSkin(raw);
  if (skin.id !== skinId) {
    throw new Error(`Skin id mismatch: expected ${skinId}, got ${skin.id}`);
  }

  const skinRoot = joinBundlePath(root, "skin/");
  const images = await resolveSkinImages(zip, skinRoot, skin.images);
  const fonts = await resolveSkinFonts(zip, skinRoot, skin.fonts);
  const customAssets = await resolveCustomAssets(zip, skinRoot, skin.customAssets);
  return {
    ...skin,
    images: images,
    fonts: fonts,
    customAssets: customAssets,
  };
}

async function loadContentPack(
  zip: JSZip,
  root: string,
  packId: string,
): Promise<ContentPack> {
  const packPath = joinBundlePath(root, "content", `${packId}.json`);
  const file = zip.file(packPath);
  if (!file) {
    throw new Error(`Missing content pack file: content/${packId}.json`);
  }

  const raw = JSON.parse(await file.async("string")) as unknown;
  const pack = parseContentPack(raw);
  if (pack.id !== packId) {
    throw new Error(`Content pack id mismatch: expected ${packId}, got ${pack.id}`);
  }
  return pack;
}

async function applyActivation(
  profileId: ProfileId,
  manifest: BundleManifest,
  importedSkins: Skin[],
): Promise<void> {
  const settings = await getSettings(profileId);
  if (!settings) {
    return;
  }

  const updated = { ...settings };
  let changed = false;

  // Prefer an explicit manifest skin; otherwise activate the last imported skin
  // so uploading a theme switches to it immediately.
  const skinId =
    manifest.activateOnImport?.skinId ??
    (importedSkins.length > 0
      ? importedSkins[importedSkins.length - 1]!.id
      : undefined);
  if (skinId && updated.activeSkinId !== skinId) {
    updated.activeSkinId = skinId;
    changed = true;
  }

  if (manifest.activateOnImport?.contentPackIds?.length) {
    const ids = new Set([
      ...settings.activeContentPackIds,
      ...manifest.activateOnImport.contentPackIds,
    ]);
    updated.activeContentPackIds = [...ids];
    changed = true;
  }

  if (changed) {
    await saveSettings(updated);
  }
}

export async function importBundleZip(
  data: ArrayBuffer | Blob | JSZip | Uint8Array,
  options: ImportBundleOptions = {},
): Promise<ImportBundleResult> {
  const zip = await normalizeZipInput(data);
  const manifestPath = findManifestPath(zip);
  const root = bundleRootFromManifestPath(manifestPath);
  const manifestFile = zip.file(manifestPath);
  if (!manifestFile) {
    throw new Error("Bundle zip missing manifest.json");
  }

  const manifest = parseBundleManifest(JSON.parse(await manifestFile.async("string")));

  const skins: Skin[] = [];
  for (const skinId of manifest.skinIds ?? []) {
    const skin = await loadSkin(zip, root, skinId);
    await putSkin(skin);
    skins.push(skin);
  }

  const packs: ContentPack[] = [];
  for (const packId of manifest.contentPackIds ?? []) {
    const pack = await loadContentPack(zip, root, packId);
    await putPack(pack);
    packs.push(pack);
  }

  const profileId = options.profileId ?? "local";
  if (options.applyActivation !== false) {
    await applyActivation(profileId, manifest, skins);
  }

  return { manifest, skins, packs };
}
