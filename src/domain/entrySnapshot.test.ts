import { describe, expect, it } from "vitest";
import type { ContentPack, DailyEntry, PackPromptDraw, ProfileSettings } from "./types";
import { applyEntrySnapshot } from "./entrySnapshot";

const SETTINGS: ProfileSettings = {
  profileId: "local",
  activeSkinId: "ocean",
  activeContentPackIds: ["hfl", "prompts"],
  backdateRepairsStreak: true,
  requireFreeWrite: false,
  backupCadence: "off",
  backupTimeLocal: "09:00",
  backupOnEdit: false,
};

const HFL_PACK: ContentPack = {
  id: "hfl",
  name: "HFL",
  version: "1.0.0",
  promptMode: "fixed",
  fields: [{ id: "surprise", label: "Surprise", type: "longText", required: false }],
  sections: [],
};

const RANDOM_PACK: ContentPack = {
  id: "prompts",
  name: "Prompts",
  version: "1.0.0",
  promptMode: "random",
  drawCount: 2,
  pool: [
    { id: "a", label: "A", type: "longText", required: false },
    { id: "b", label: "B", type: "longText", required: false },
    { id: "c", label: "C", type: "longText", required: false },
  ],
  fields: [],
  sections: [],
};

function baseEntry(overrides: Partial<DailyEntry> = {}): DailyEntry {
  return {
    id: "local:2026-07-23",
    profileId: "local",
    date: "2026-07-23",
    body: "",
    answers: [],
    completedByPack: {},
    skinId: "old-skin",
    contentPackIds: ["old-pack"],
    promptDraw: {
      "old-pack": { main: ["x"] },
      prompts: { main: ["a", "b"] },
    },
    tags: [],
    createdAt: "2026-07-23T08:00:00.000Z",
    updatedAt: "2026-07-23T08:00:00.000Z",
    ...overrides,
  };
}

describe("applyEntrySnapshot", () => {
  it("refreshes skinId and contentPackIds from settings", () => {
    const result = applyEntrySnapshot(baseEntry(), SETTINGS, [HFL_PACK, RANDOM_PACK]);

    expect(result.skinId).toBe("ocean");
    expect(result.contentPackIds).toEqual(["hfl", "prompts"]);
  });

  it("prunes promptDraw for inactive packs and keeps active draws", () => {
    const result = applyEntrySnapshot(baseEntry(), SETTINGS, [HFL_PACK, RANDOM_PACK]);

    expect(result.promptDraw["old-pack"]).toBeUndefined();
    expect(result.promptDraw.prompts).toEqual({ main: ["a", "b"] });
  });

  it("draws random prompts when missing for an active pack", () => {
    const result = applyEntrySnapshot(
      baseEntry({ promptDraw: {} }),
      SETTINGS,
      [HFL_PACK, RANDOM_PACK],
    );

    expect(result.promptDraw.prompts?.main).toHaveLength(2);
  });

  it("migrates legacy string[] promptDraw to section-keyed form", () => {
    const result = applyEntrySnapshot(
      baseEntry({ promptDraw: { prompts: ["a", "b"] as unknown as PackPromptDraw } }),
      SETTINGS,
      [HFL_PACK, RANDOM_PACK],
    );

    expect(result.promptDraw.prompts).toEqual({ main: ["a", "b"] });
  });
});
