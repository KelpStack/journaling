import { describe, it, expect } from "vitest";
import { applyStickyCompletion, isAnswered } from "./completion";
import type { ContentPack, DailyEntry } from "./types";

const pack: ContentPack = {
  id: "sports",
  name: "Sports",
  version: "1",
  promptMode: "fixed",
  fields: [
    { id: "miles", label: "Miles", type: "number", required: true, stats: true },
    { id: "notes", label: "Notes", type: "longText", required: false },
  ],
  sections: [],
};

function baseEntry(over: Partial<DailyEntry> = {}): DailyEntry {
  return {
    id: "local:2026-07-20",
    profileId: "local",
    date: "2026-07-20",
    body: "",
    answers: [],
    completedByPack: {},
    skinId: "minimal",
    contentPackIds: ["sports"],
    promptDraw: {},
    tags: [],
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z",
    ...over,
  };
}

describe("completion", () => {
  it("does not complete pack until required answered", () => {
    const next = applyStickyCompletion(baseEntry(), [pack], {
      requireFreeWrite: false,
      nowIso: "2026-07-22T12:00:00.000Z",
    });
    expect(next.completedByPack.sports).toBeUndefined();
    expect(next.completedAt).toBeUndefined();
  });

  it("sets sticky pack completion when required filled", () => {
    const entry = baseEntry({
      answers: [{ fieldRef: "sports:miles", value: 3 }],
    });
    const next = applyStickyCompletion(entry, [pack], {
      requireFreeWrite: false,
      nowIso: "2026-07-22T12:00:00.000Z",
    });
    expect(next.completedByPack.sports).toBe("2026-07-22T12:00:00.000Z");
  });

  it("keeps sticky completion after clearing required field", () => {
    const entry = baseEntry({
      answers: [{ fieldRef: "sports:miles", value: null }],
      completedByPack: { sports: "2026-07-22T12:00:00.000Z" },
      completedAt: "2026-07-22T12:00:00.000Z",
    });
    const next = applyStickyCompletion(entry, [pack], {
      requireFreeWrite: false,
      nowIso: "2026-07-22T13:00:00.000Z",
    });
    expect(next.completedByPack.sports).toBe("2026-07-22T12:00:00.000Z");
    expect(next.completedAt).toBe("2026-07-22T12:00:00.000Z");
  });

  it("treats null/undefined/empty string as unanswered", () => {
    expect(isAnswered(null, "number")).toBe(false);
    expect(isAnswered("", "longText")).toBe(false);
    expect(isAnswered("", "shortText")).toBe(false);
    expect(isAnswered("hi", "shortText")).toBe(true);
    expect(isAnswered(0, "number")).toBe(true);
    expect(isAnswered(false, "yesNo")).toBe(true);
    expect(isAnswered({ a: false, b: false }, "checklist")).toBe(false);
    expect(isAnswered({ a: true }, "checklist")).toBe(true);
  });

  it("treats valid journal dates as answered for date fields", () => {
    expect(isAnswered("2026-07-20", "date")).toBe(true);
    expect(isAnswered("not-a-date", "date")).toBe(false);
    expect(isAnswered("", "date")).toBe(false);
  });

  it("ignores requireFreeWrite when free-write is hidden", () => {
    const entry = baseEntry({
      answers: [{ fieldRef: "sports:miles", value: 3 }],
    });
    const next = applyStickyCompletion(entry, [pack], {
      requireFreeWrite: true,
      showFreeWrite: false,
      nowIso: "2026-07-22T12:00:00.000Z",
    });
    expect(next.completedAt).toBe("2026-07-22T12:00:00.000Z");
  });
});
