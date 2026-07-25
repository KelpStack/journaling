import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../db/database";
import { ensureSeeded } from "../db/seed";
import { getSettings, saveSettings } from "../db/settingsRepo";
import type { ProfileSettings } from "../domain/types";
import {
  cadencePeriodMs,
  fullBackupZipFilename,
  isPastBackupTimeLocal,
  isScheduledBackupDue,
  maybeRunScheduledBackup,
  runBackup,
} from "./schedule";
import { writeBackupToFolder } from "./backupFolder";

vi.mock("./download", () => ({
  downloadBlob: vi.fn(),
}));

vi.mock("./backupFolder", () => ({
  writeBackupToFolder: vi.fn().mockResolvedValue(false),
}));

const BASE_SETTINGS: ProfileSettings = {
  profileId: "local",
  activeSkinId: "hfl-minimal",
  activeContentPackIds: ["hfl"],
  backdateRepairsStreak: true,
  requireFreeWrite: false,
  backupCadence: "daily",
  backupTimeLocal: "09:00",
  backupOnEdit: false,
};

beforeEach(async () => {
  vi.mocked(writeBackupToFolder).mockResolvedValue(false);
  await db.delete();
  await db.open();
  await ensureSeeded("local");
});

describe("cadencePeriodMs", () => {
  it("maps cadence values to millisecond periods", () => {
    expect(cadencePeriodMs("off")).toBeNull();
    expect(cadencePeriodMs("daily")).toBe(24 * 60 * 60 * 1000);
    expect(cadencePeriodMs("weekly")).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("isPastBackupTimeLocal", () => {
  it("returns false before the configured local time", () => {
    const now = new Date("2026-07-23T08:30:00");
    expect(isPastBackupTimeLocal(now, "09:00")).toBe(false);
  });

  it("returns true at or after the configured local time", () => {
    const now = new Date("2026-07-23T09:00:00");
    expect(isPastBackupTimeLocal(now, "09:00")).toBe(true);
    expect(isPastBackupTimeLocal(new Date("2026-07-23T12:00:00"), "09:00")).toBe(true);
  });
});

describe("isScheduledBackupDue", () => {
  it("returns false when cadence is off", () => {
    const settings: ProfileSettings = {
      ...BASE_SETTINGS,
      backupCadence: "off",
    };
    expect(isScheduledBackupDue(settings, new Date("2026-07-23T10:00:00"))).toBe(false);
  });

  it("returns false before backup time even when overdue", () => {
    const settings: ProfileSettings = {
      ...BASE_SETTINGS,
      lastBackupAt: "2026-07-20T10:00:00.000Z",
    };
    expect(isScheduledBackupDue(settings, new Date("2026-07-23T08:00:00"))).toBe(false);
  });

  it("returns true when cadence elapsed and past backup time", () => {
    const settings: ProfileSettings = {
      ...BASE_SETTINGS,
      lastBackupAt: "2026-07-20T10:00:00.000Z",
    };
    expect(isScheduledBackupDue(settings, new Date("2026-07-23T10:00:00"))).toBe(true);
  });

  it("returns false when last backup is still within cadence", () => {
    const settings: ProfileSettings = {
      ...BASE_SETTINGS,
      lastBackupAt: "2026-07-23T08:30:00.000Z",
    };
    expect(isScheduledBackupDue(settings, new Date("2026-07-23T10:00:00"))).toBe(false);
  });
});

describe("fullBackupZipFilename", () => {
  it("includes the export date", () => {
    expect(fullBackupZipFilename(new Date("2026-07-23T15:00:00.000Z"))).toBe(
      "journal-backup-2026-07-23.zip",
    );
  });
});

describe("maybeRunScheduledBackup", () => {
  it("records lastBackupAt when a scheduled backup runs", async () => {
    vi.mocked(writeBackupToFolder).mockResolvedValue(true);

    await saveSettings({
      ...BASE_SETTINGS,
      backupCadence: "daily",
      backupTimeLocal: "09:00",
      lastBackupAt: "2026-07-20T10:00:00.000Z",
    });

    vi.setSystemTime(new Date("2026-07-23T10:00:00"));

    const ran = await maybeRunScheduledBackup("local");
    expect(ran).toBe(true);

    const settings = await getSettings("local");
    expect(settings?.lastBackupAt).toBe(new Date("2026-07-23T10:00:00").toISOString());
  });

  it("skips when backup is not due", async () => {
    await saveSettings({
      ...BASE_SETTINGS,
      lastBackupAt: "2026-07-23T09:30:00.000Z",
    });

    vi.setSystemTime(new Date("2026-07-23T10:00:00"));

    const ran = await maybeRunScheduledBackup("local");
    expect(ran).toBe(false);
  });
});

describe("runBackup delivery", () => {
  it("does not advance lastBackupAt when delivery fails", async () => {
    vi.mocked(writeBackupToFolder).mockResolvedValue(false);

    await saveSettings({
      ...BASE_SETTINGS,
      lastBackupAt: "2026-07-20T10:00:00.000Z",
    });

    vi.setSystemTime(new Date("2026-07-23T10:00:00"));

    const delivery = await runBackup("local");
    expect(delivery.ok).toBe(false);

    const settings = await getSettings("local");
    expect(settings?.lastBackupAt).toBe("2026-07-20T10:00:00.000Z");
  });

  it("advances lastBackupAt when folder delivery succeeds", async () => {
    vi.mocked(writeBackupToFolder).mockResolvedValue(true);

    await saveSettings({
      ...BASE_SETTINGS,
      lastBackupAt: "2026-07-20T10:00:00.000Z",
    });

    vi.setSystemTime(new Date("2026-07-23T10:00:00"));

    const delivery = await runBackup("local");
    expect(delivery).toEqual({ ok: true, method: "folder" });

    const settings = await getSettings("local");
    expect(settings?.lastBackupAt).toBe(new Date("2026-07-23T10:00:00").toISOString());
  });
});
