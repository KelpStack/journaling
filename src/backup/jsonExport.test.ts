import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/database";
import { getOrCreateEntry } from "../db/entriesRepo";
import { listPacks } from "../db/packsRepo";
import { ensureSeeded } from "../db/seed";
import { getSettings } from "../db/settingsRepo";
import { listSkins } from "../db/skinsRepo";
import type { DailyEntry } from "../domain/types";
import { isEncryptedEnvelope } from "./crypto";
import {
  buildBackupPayload,
  exportJsonBackup,
  isJournalBackupPayload,
  jsonBackupFilename,
} from "./jsonExport";
import { importJsonBackup, parseJsonBackup } from "./jsonImport";

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureSeeded("local");
});

async function sampleEntry(
  date = "2026-07-20",
  overrides: Partial<DailyEntry> = {},
): Promise<DailyEntry> {
  const base = await getOrCreateEntry("local", date);
  const entry: DailyEntry = {
    ...base,
    body: "Rain on the walk home.",
    answers: [{ fieldRef: "hfl:surprise", value: "Unexpected kindness" }],
    completedByPack: { hfl: "2026-07-20T18:00:00.000Z" },
    completedAt: "2026-07-20T18:00:00.000Z",
    skinId: "hfl-minimal",
    contentPackIds: ["hfl"],
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T18:00:00.000Z",
    ...overrides,
  };
  await db.entries.put(entry);
  return entry;
}

describe("buildBackupPayload", () => {
  it("includes entries, packs, skins, and settings", async () => {
    await sampleEntry();
    const payload = await buildBackupPayload({ profileId: "local" });

    expect(payload.v).toBe(1);
    expect(payload.profileId).toBe("local");
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0]?.date).toBe("2026-07-20");
    expect(payload.packs.some((pack) => pack.id === "hfl")).toBe(true);
    expect(payload.skins.some((skin) => skin.id === "hfl-minimal")).toBe(true);
    expect(payload.settings?.activeSkinId).toBe("ocean");
  });
});

describe("exportJsonBackup", () => {
  it("writes unencrypted JSON when no passphrase is provided", async () => {
    await sampleEntry();
    const raw = await exportJsonBackup({ profileId: "local" });
    const parsed = JSON.parse(raw);

    expect(isJournalBackupPayload(parsed)).toBe(true);
    expect(isEncryptedEnvelope(parsed)).toBe(false);
    expect(parsed.entries[0]?.body).toBe("Rain on the walk home.");
  });

  it("writes an encrypted envelope when a passphrase is provided", async () => {
    await sampleEntry();
    const raw = await exportJsonBackup({
      profileId: "local",
      passphrase: "backup-secret",
    });
    const parsed = JSON.parse(raw);

    expect(isEncryptedEnvelope(parsed)).toBe(true);
    expect(isJournalBackupPayload(parsed)).toBe(false);
  });

  it("names encrypted and plain backup files differently", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    expect(jsonBackupFilename(false, now)).toBe("journal-backup-2026-07-22.json");
    expect(jsonBackupFilename(true, now)).toBe("journal-backup-2026-07-22.encrypted.json");
  });
});

describe("json import round-trip", () => {
  it("restores entries, packs, skins, and settings from plain JSON", async () => {
    await sampleEntry();
    const exported = await exportJsonBackup({ profileId: "local" });

    await db.entries.clear();
    await db.packs.clear();
    await db.skins.clear();
    await db.settings.clear();
    await db.search.clear();

    const result = await importJsonBackup(exported, { profileId: "local" });
    expect(result).toMatchObject({
      entriesImported: 1,
      entriesSkipped: 0,
      packsImported: 1,
      skinsImported: 2,
      settingsImported: true,
    });

    const restored = await db.entries.get("local:2026-07-20");
    expect(restored?.body).toBe("Rain on the walk home.");
    expect((await listPacks()).some((pack) => pack.id === "hfl")).toBe(true);
    expect((await listSkins()).some((skin) => skin.id === "hfl-minimal")).toBe(true);
    expect((await listSkins()).some((skin) => skin.id === "ocean")).toBe(true);
    expect((await getSettings("local"))?.activeSkinId).toBe("ocean");
  });

  it("restores data from encrypted JSON with the correct passphrase", async () => {
    await sampleEntry();
    const exported = await exportJsonBackup({
      profileId: "local",
      passphrase: "backup-secret",
    });

    await db.entries.clear();
    await db.search.clear();

    const payload = await parseJsonBackup(exported, "backup-secret");
    expect(payload.entries[0]?.body).toBe("Rain on the walk home.");

    const result = await importJsonBackup(exported, {
      profileId: "local",
      passphrase: "backup-secret",
    });
    expect(result.entriesImported).toBe(1);
    expect((await db.entries.get("local:2026-07-20"))?.body).toBe("Rain on the walk home.");
  });

  it("rejects encrypted JSON without a passphrase", async () => {
    const exported = await exportJsonBackup({
      profileId: "local",
      passphrase: "backup-secret",
    });

    await expect(parseJsonBackup(exported)).rejects.toThrow(/Passphrase required/i);
    await expect(importJsonBackup(exported)).rejects.toThrow(/Passphrase required/i);
  });

  it("rejects encrypted JSON with the wrong passphrase", async () => {
    const exported = await exportJsonBackup({
      profileId: "local",
      passphrase: "backup-secret",
    });

    await expect(parseJsonBackup(exported, "wrong")).rejects.toThrow(
      /wrong passphrase|Decryption failed/i,
    );
  });
});

describe("json import conflict policy", () => {
  it("keeps the newer existing entry by default", async () => {
    await sampleEntry("2026-07-20", { updatedAt: "2026-07-20T20:00:00.000Z" });

    const payload = await buildBackupPayload({ profileId: "local" });
    payload.entries[0] = {
      ...payload.entries[0]!,
      body: "Stale import",
      updatedAt: "2026-07-20T10:00:00.000Z",
    };

    const result = await importJsonBackup(JSON.stringify(payload), { profileId: "local" });
    expect(result.entriesSkipped).toBe(1);
    expect((await db.entries.get("local:2026-07-20"))?.body).toBe("Rain on the walk home.");
  });

  it("honors forceOverwrite for older imports", async () => {
    await sampleEntry("2026-07-20", { updatedAt: "2026-07-20T20:00:00.000Z" });

    const payload = await buildBackupPayload({ profileId: "local" });
    payload.entries[0] = {
      ...payload.entries[0]!,
      body: "Forced import",
      updatedAt: "2026-07-20T10:00:00.000Z",
    };

    await importJsonBackup(JSON.stringify(payload), {
      profileId: "local",
      forceOverwrite: ["2026-07-20"],
    });

    expect((await db.entries.get("local:2026-07-20"))?.body).toBe("Forced import");
  });
});
