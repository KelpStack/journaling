import { beforeEach, describe, expect, it } from "vitest";
import { HFL_PACK } from "../packs/builtInPacks";
import { OCEAN_SKIN } from "../packs/builtInSkins";
import { HFL_SKIN } from "../packs/hflBuiltIn";
import { db } from "./database";
import { listPacks } from "./packsRepo";
import { ensureSeeded } from "./seed";
import { getSettings, saveSettings } from "./settingsRepo";
import { getSkin, listSkins, putSkin } from "./skinsRepo";
import { getPack, putPack } from "./packsRepo";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("HFL built-in constants", () => {
  it("HFL has reflection + check-in sections", () => {
    expect(HFL_PACK.version).toBe("3.0.0");
    expect(HFL_PACK.sections).toHaveLength(2);
    expect(HFL_PACK.sections[0]).toMatchObject({
      id: "reflection",
      promptMode: "random",
      drawCount: 1,
    });
    expect(HFL_PACK.sections[1]).toMatchObject({
      id: "check-in",
      promptMode: "fixed",
    });
    expect(HFL_PACK.sections[1]?.fields.map((f) => f.id)).toEqual([
      "mood",
      "weather",
    ]);
  });

  it("defines a random reflection pool with one draw per entry", () => {
    expect(HFL_PACK).toMatchObject({
      id: "hfl",
      hideFreeWrite: false,
    });
    const reflection = HFL_PACK.sections[0];
    expect(reflection?.pool?.length).toBeGreaterThanOrEqual(6);
    expect(reflection?.pool?.[0]).toMatchObject({
      id: "surprise",
      type: "longText",
      required: true,
    });
  });

  it("defines a full Minimal skin without purple accents", () => {
    expect(HFL_SKIN.id).toBe("hfl-minimal");
    expect(HFL_SKIN.panelStyle).toBe("paper");
    expect(HFL_SKIN.opacity?.surface).toBeGreaterThan(0.9);
    expect(HFL_SKIN.customCss).toContain("--skin-paper-line");
    expect(HFL_SKIN.tokens.accent).not.toMatch(/purple|#8[0-9a-f]{5}|#9[0-9a-f]{5}/i);
  });

  it("defines a full Ocean skin", () => {
    expect(OCEAN_SKIN.id).toBe("ocean");
    expect(OCEAN_SKIN.panelStyle).toBe("card");
    expect(OCEAN_SKIN.backgroundFit).toBe("cover");
    expect(OCEAN_SKIN.images?.tilingBackground).toMatch(/^data:image\/svg\+xml/);
  });
});

describe("ensureSeeded", () => {
  it("seeds built-in packs, skins, and default settings on first run", async () => {
    await ensureSeeded("local");

    expect(await getSettings("local")).toEqual({
      profileId: "local",
      activeContentPackIds: ["hfl"],
      activeSkinId: "ocean",
      backdateRepairsStreak: true,
      requireFreeWrite: false,
      multiPackShowOneAtATime: true,
      backupCadence: "off",
      backupTimeLocal: "09:00",
      backupOnEdit: false,
    });
    const packs = await listPacks();
    expect(packs).toHaveLength(1);
    expect(packs.find((p) => p.id === "hfl")).toEqual(HFL_PACK);
    const skins = await listSkins();
    expect(skins).toHaveLength(2);
    expect(skins.find((s) => s.id === "hfl-minimal")).toEqual(HFL_SKIN);
    expect(skins.find((s) => s.id === "ocean")).toEqual(OCEAN_SKIN);
  });

  it("is idempotent when settings already exist", async () => {
    await ensureSeeded("local");
    await ensureSeeded("local");

    expect(await listPacks()).toHaveLength(1);
    expect(await listSkins()).toHaveLength(2);
  });

  it("does not overwrite existing settings", async () => {
    await ensureSeeded("local");

    const modified = {
      ...(await getSettings("local"))!,
      activeSkinId: "custom",
      activeContentPackIds: ["other"],
    };
    await saveSettings(modified);

    await ensureSeeded("local");

    expect(await getSettings("local")).toEqual(modified);
  });

  it("refreshes built-in packs and skins even when settings already exist", async () => {
    await ensureSeeded("local");
    await putSkin({
      ...HFL_SKIN,
      name: "Edited Minimal",
      version: "0.0.1",
      customCss: undefined,
    });
    await putPack({
      ...HFL_PACK,
      name: "Edited HFL",
      version: "0.0.1",
    });

    await ensureSeeded("local");

    expect(await getSkin("hfl-minimal")).toEqual(HFL_SKIN);
    expect(await getPack("hfl")).toEqual(HFL_PACK);
    expect(await getSkin("ocean")).toEqual(OCEAN_SKIN);
  });
});
