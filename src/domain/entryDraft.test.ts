import { describe, expect, it } from "vitest";
import { canApplySavedEntry } from "./entryDraft";
import type { DailyEntry } from "./types";

function entry(over: Partial<DailyEntry> = {}): DailyEntry {
  return {
    id: "local:2026-07-20",
    profileId: "local",
    date: "2026-07-20",
    body: "hello",
    answers: [],
    completedByPack: {},
    skinId: "ocean",
    contentPackIds: ["hfl"],
    promptDraw: {},
    tags: [],
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...over,
  };
}

describe("canApplySavedEntry", () => {
  it("allows the save result when the open draft is unchanged", () => {
    const source = entry();
    const viewing = entry({ completedAt: "later" });
    expect(canApplySavedEntry(viewing, source)).toBe(true);
  });

  it("rejects a save that would clobber newer typing", () => {
    const source = entry({ body: "a" });
    const viewing = entry({ body: "ab" });
    expect(canApplySavedEntry(viewing, source)).toBe(false);
  });

  it("rejects a save after the page has moved to another day", () => {
    const source = entry();
    const viewing = entry({
      id: "local:2026-07-21",
      date: "2026-07-21",
      body: "",
    });
    expect(canApplySavedEntry(viewing, source)).toBe(false);
  });
});
