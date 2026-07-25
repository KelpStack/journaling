import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HFL_PACK, HFL_SKIN } from "./hflBuiltIn";
import { OCEAN_SKIN } from "./builtInSkins";
import {
  TRAVEL_LOG_BUNDLE_MANIFEST,
  TRAVEL_LOG_PACK,
} from "./travelLogSample";
import { importBundleZip } from "./importZip";
import { exportBundleZip } from "./exportZip";
import { db } from "../db/database";
import { getPack, listPacks } from "../db/packsRepo";
import { getSkin, listSkins, putSkin } from "../db/skinsRepo";
import { ensureSeeded } from "../db/seed";
import { getSettings } from "../db/settingsRepo";
import type { ContentPack, Skin } from "../domain/types";

const TRAVEL_LOG_ZIP_PATH = join(
  process.cwd(),
  "public",
  "samples",
  "travel-log.zip",
);
const LINED_JOURNAL_ZIP_PATH = join(
  process.cwd(),
  "public",
  "samples",
  "lined-journal.zip",
);

async function buildZip(
  rootName: string,
  manifest: object,
  options?: {
    skin?: Skin;
    pack?: ContentPack;
    skinAsset?: { path: string; data: string };
  },
): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const root = zip.folder(rootName)!;
  root.file("manifest.json", JSON.stringify(manifest, null, 2));

  if (options?.skin) {
    const skinJson = { ...options.skin };
    const skinFolder = root.folder("skin")!;
    if (options.skinAsset) {
      skinJson.images = {
        ...skinJson.images,
        tilingBackground: options.skinAsset.path,
      };
      skinFolder
        .folder("assets")!
        .file(options.skinAsset.path.split("/").pop()!, options.skinAsset.data);
    } else if (skinJson.images?.tilingBackground?.startsWith("data:")) {
      // Keep data URLs as-is for synthetic skins already inlined.
    } else if (skinJson.images) {
      delete skinJson.images;
    }
    skinFolder.file(`${options.skin.id}.json`, JSON.stringify(skinJson, null, 2));
  }

  if (options?.pack) {
    root
      .folder("content")!
      .file(`${options.pack.id}.json`, JSON.stringify(options.pack, null, 2));
  }

  return zip.generateAsync({ type: "arraybuffer" });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("importBundleZip", () => {
  it("registers skin and content pack independently from a bundle", async () => {
    const zip = await buildZip(
      "ocean-travel",
      {
        name: "Ocean Travel",
        version: "1.0.0",
        skinIds: ["ocean"],
        contentPackIds: ["travel-log"],
      },
      {
        skin: { ...OCEAN_SKIN, images: undefined },
        pack: TRAVEL_LOG_PACK,
      },
    );

    const result = await importBundleZip(zip, {
      profileId: "local",
      applyActivation: false,
    });

    expect(result.skins).toHaveLength(1);
    expect(result.packs).toHaveLength(1);
    expect(await getSkin("ocean")).toMatchObject({ id: "ocean", name: "Ocean" });
    expect(await getPack("travel-log")).toMatchObject({
      id: "travel-log",
      name: "Travel Log",
    });
    expect((await getPack("travel-log"))!.sections).toHaveLength(3);
  });

  it("registers skin-only bundle without content", async () => {
    const manifest = {
      name: "Ocean Skin",
      version: "1.0.0",
      skinIds: ["ocean"],
    };
    const zip = await buildZip("ocean-skin", manifest, { skin: OCEAN_SKIN });

    await importBundleZip(zip);

    expect(await listSkins()).toEqual([
      expect.objectContaining({ id: "ocean" }),
    ]);
    expect(await listPacks()).toEqual([]);
  });

  it("registers content-only bundle without skin", async () => {
    const zip = await buildZip(
      "travel-log",
      TRAVEL_LOG_BUNDLE_MANIFEST,
      { pack: TRAVEL_LOG_PACK },
    );

    await importBundleZip(zip);

    expect(await listPacks()).toEqual([
      expect.objectContaining({ id: "travel-log" }),
    ]);
    expect(await listSkins()).toEqual([]);
  });

  it("applies activateOnImport when requested", async () => {
    await ensureSeeded("local");
    const zip = await buildZip(
      "travel-log",
      TRAVEL_LOG_BUNDLE_MANIFEST,
      { pack: TRAVEL_LOG_PACK },
    );

    await importBundleZip(zip, { profileId: "local", applyActivation: true });

    const settings = await getSettings("local");
    expect(settings?.activeContentPackIds).toEqual(
      expect.arrayContaining(["hfl", "travel-log"]),
    );
  });

  it("imports checked-in public/samples/travel-log.zip", async () => {
    const zip = readFileSync(TRAVEL_LOG_ZIP_PATH);
    const result = await importBundleZip(new Uint8Array(zip));

    expect(result.packs.map((p) => p.id)).toContain("travel-log");
    expect(result.skins).toHaveLength(0);
    const pack = await getPack("travel-log");
    expect(pack?.sections).toHaveLength(3);
    expect(pack?.sections[0]?.promptMode).toBe("random");
  });

  it("imports checked-in public/samples/lined-journal.zip", async () => {
    const zip = readFileSync(LINED_JOURNAL_ZIP_PATH);
    const result = await importBundleZip(new Uint8Array(zip));

    expect(result.skins.map((s) => s.id)).toContain("lined-journal");
    expect(result.packs).toHaveLength(0);
    const skin = await getSkin("lined-journal");
    expect(skin?.name).toMatch(/lined/i);
  });
});

describe("exportBundleZip round-trip", () => {
  it("preserves skin and pack through export and re-import", async () => {
    const skinForExport: Skin = {
      ...OCEAN_SKIN,
      images: undefined,
    };
    const zip = await buildZip(
      "ocean-travel",
      {
        name: "Ocean Travel",
        version: "1.0.0",
        skinIds: ["ocean"],
        contentPackIds: ["travel-log"],
      },
      {
        skin: skinForExport,
        pack: TRAVEL_LOG_PACK,
      },
    );

    await importBundleZip(zip, { applyActivation: false });
    const importedSkin = (await getSkin("ocean"))!;
    const importedPack = (await getPack("travel-log"))!;

    const exported = await exportBundleZip({
      name: "Ocean Travel",
      version: "1.0.0",
      skinIds: ["ocean"],
      contentPackIds: ["travel-log"],
    });

    await db.skins.clear();
    await db.packs.clear();

    await importBundleZip(await exported.arrayBuffer(), {
      applyActivation: false,
    });

    expect(await getSkin("ocean")).toEqual(importedSkin);
    expect(await getPack("travel-log")).toEqual(importedPack);
  });

  it("round-trips the checked-in travel-log sample zip", async () => {
    const sample = readFileSync(TRAVEL_LOG_ZIP_PATH);
    await importBundleZip(new Uint8Array(sample), {
      applyActivation: false,
    });
    const pack = (await getPack("travel-log"))!;

    const exported = await exportBundleZip({
      name: TRAVEL_LOG_BUNDLE_MANIFEST.name,
      version: TRAVEL_LOG_BUNDLE_MANIFEST.version,
      contentPackIds: ["travel-log"],
    });

    await db.packs.clear();
    await importBundleZip(await exported.arrayBuffer(), {
      applyActivation: false,
    });

    expect(await getPack("travel-log")).toEqual(pack);
  });

  it("preserves customAssets and customCss through export and re-import", async () => {
    const skinWithCustomAssets: Skin = {
      ...OCEAN_SKIN,
      id: "ocean-custom-test",
      images: undefined,
      customAssets: [
        {
          key: "corner-sticker",
          dataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        },
      ],
      customCss:
        ".pack-section::after { content: var(--skin-asset-corner-sticker); }",
    };

    await putSkin(skinWithCustomAssets);

    const exported = await exportBundleZip({
      name: "Ocean Custom",
      version: "1.0.0",
      skinIds: ["ocean-custom-test"],
    });

    await db.skins.clear();
    await importBundleZip(await exported.arrayBuffer(), {
      applyActivation: false,
    });

    const imported = await getSkin("ocean-custom-test");
    expect(imported?.customCss).toBe(skinWithCustomAssets.customCss);
    expect(imported?.customAssets).toHaveLength(1);
    expect(imported?.customAssets?.[0].key).toBe("corner-sticker");
    expect(imported?.customAssets?.[0].dataUrl).toMatch(/^data:image\/png/);
  });
});

describe("imported travel log coexists with built-in HFL", () => {
  it("keeps HFL seeded while adding travel log", async () => {
    await ensureSeeded("local");
    const zip = await buildZip(
      "travel-log",
      TRAVEL_LOG_BUNDLE_MANIFEST,
      { pack: TRAVEL_LOG_PACK },
    );
    await importBundleZip(zip, { applyActivation: false });

    const packIds = (await listPacks()).map((p) => p.id).sort();
    const skinIds = (await listSkins()).map((s) => s.id).sort();

    expect(packIds).toEqual(["hfl", "travel-log"].sort());
    expect(skinIds).toEqual(["hfl-minimal", "ocean"].sort());
    expect(await getPack("hfl")).toEqual(HFL_PACK);
    expect(await getSkin("hfl-minimal")).toEqual(HFL_SKIN);
  });
});
