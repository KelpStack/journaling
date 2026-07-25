import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { exportJsonBackup } from "../backup/jsonExport";
import { importJsonBackup } from "../backup/jsonImport";
import { exportVaultZip } from "../backup/vaultExport";
import { importVaultZip } from "../backup/vaultImport";
import { isEncryptedEnvelope } from "../backup/crypto";
import { db } from "../db/database";
import { getOrCreateEntry, upsertEntry } from "../db/entriesRepo";
import { listPacks } from "../db/packsRepo";
import { ensureSeeded } from "../db/seed";
import { getSettings, saveSettings } from "../db/settingsRepo";
import { applyStickyCompletion } from "../domain/completion";
import { importBundleZip } from "./importZip";

const PROFILE_ID = "local";
const JOURNAL_DATE = "2026-07-22";
const COMPLETION_ISO = "2026-07-22T18:00:00.000Z";
const PASSPHRASE = "multipack-test-secret";
const SAMPLE_ZIP_PATH = join(
  process.cwd(),
  "public",
  "samples",
  "travel-log.zip",
);

async function wipeDatabase(): Promise<void> {
  await db.delete();
  await db.open();
}

beforeEach(async () => {
  await wipeDatabase();
});

describe("multipack end-to-end", () => {
  it("seeds HFL, imports travel log, completes both packs, and round-trips vault + encrypted JSON", async () => {
    await ensureSeeded(PROFILE_ID);

    const travelZip = readFileSync(SAMPLE_ZIP_PATH);
    await importBundleZip(new Uint8Array(travelZip), {
      profileId: PROFILE_ID,
      applyActivation: true,
    });

    const settings = await getSettings(PROFILE_ID);
    expect(settings?.activeContentPackIds).toEqual(
      expect.arrayContaining(["hfl", "travel-log"]),
    );

    // Keep both packs active (and only those) for sticky completion.
    await saveSettings({
      ...settings!,
      activeContentPackIds: ["hfl", "travel-log"],
    });

    let entry = await getOrCreateEntry(PROFILE_ID, JOURNAL_DATE);
    entry = {
      ...entry,
      body: "Market morning and a long walk along the river.",
      answers: [
        { fieldRef: "hfl:surprise", value: "A street musician played our song" },
        {
          fieldRef: "travel-log:street-food",
          value: "Chili mango with lime salt",
        },
        {
          fieldRef: "travel-log:chronicle",
          value: "Old town loop, detour through the botanical garden, soft dusk.",
        },
      ],
      contentPackIds: ["hfl", "travel-log"],
      promptDraw: {
        hfl: { reflection: ["surprise"] },
        "travel-log": { reflection: ["street-food"] },
      },
    };

    const activePacks = (await listPacks()).filter((pack) =>
      entry.contentPackIds.includes(pack.id),
    );
    entry = applyStickyCompletion(entry, activePacks, {
      requireFreeWrite: settings?.requireFreeWrite ?? false,
      nowIso: COMPLETION_ISO,
    });
    await upsertEntry(entry);

    expect(entry.completedByPack.hfl).toBe(COMPLETION_ISO);
    expect(entry.completedByPack["travel-log"]).toBe(COMPLETION_ISO);
    expect(entry.completedAt).toBe(COMPLETION_ISO);

    const vaultBlob = await exportVaultZip({ profileId: PROFILE_ID });
    const vaultZip = await JSZip.loadAsync(await vaultBlob.arrayBuffer());
    const vaultPaths = Object.keys(vaultZip.files).filter(
      (path) => !vaultZip.files[path]!.dir,
    );
    expect(vaultPaths.some((path) => path.endsWith(`${JOURNAL_DATE}.md`))).toBe(
      true,
    );

    const encryptedJson = await exportJsonBackup({
      profileId: PROFILE_ID,
      passphrase: PASSPHRASE,
    });
    expect(isEncryptedEnvelope(JSON.parse(encryptedJson))).toBe(true);

    await wipeDatabase();

    const jsonResult = await importJsonBackup(encryptedJson, {
      profileId: PROFILE_ID,
      passphrase: PASSPHRASE,
    });
    expect(jsonResult.entriesImported).toBe(1);
    expect(jsonResult.packsImported).toBeGreaterThanOrEqual(2);

    const restoredFromJson = await db.entries.get(
      `${PROFILE_ID}:${JOURNAL_DATE}`,
    );
    expect(restoredFromJson?.date).toBe(JOURNAL_DATE);
    expect(restoredFromJson?.completedByPack).toEqual({
      hfl: COMPLETION_ISO,
      "travel-log": COMPLETION_ISO,
    });
    expect(restoredFromJson?.answers).toEqual([
      { fieldRef: "hfl:surprise", value: "A street musician played our song" },
      {
        fieldRef: "travel-log:street-food",
        value: "Chili mango with lime salt",
      },
      {
        fieldRef: "travel-log:chronicle",
        value: "Old town loop, detour through the botanical garden, soft dusk.",
      },
    ]);

    await db.entries.clear();
    await db.search.clear();

    const vaultResult = await importVaultZip(await vaultBlob.arrayBuffer(), {
      profileId: PROFILE_ID,
    });
    expect(vaultResult.imported).toBe(1);

    const restoredFromVault = await db.entries.get(
      `${PROFILE_ID}:${JOURNAL_DATE}`,
    );
    expect(restoredFromVault?.date).toBe(JOURNAL_DATE);
    expect(restoredFromVault?.body).toBe(
      "Market morning and a long walk along the river.",
    );
    expect(restoredFromVault?.completedByPack).toEqual({
      hfl: COMPLETION_ISO,
      "travel-log": COMPLETION_ISO,
    });
    expect(restoredFromVault?.answers).toEqual([
      { fieldRef: "hfl:surprise", value: "A street musician played our song" },
      {
        fieldRef: "travel-log:street-food",
        value: "Chili mango with lime salt",
      },
      {
        fieldRef: "travel-log:chronicle",
        value: "Old town loop, detour through the botanical garden, soft dusk.",
      },
    ]);
    expect(restoredFromVault?.completedAt).toBe(COMPLETION_ISO);
  });
});
