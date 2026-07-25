import { describe, it, expect } from "vitest";
import { ensurePromptDraw, redrawPromptDraw } from "./randomDraw";
import type { ContentPack, DailyEntry, PackField } from "./types";

function field(id: string): PackField {
  return { id, label: id, type: "longText", required: false };
}

function baseEntry(over: Partial<DailyEntry> = {}): DailyEntry {
  return {
    id: "local:2026-07-20",
    profileId: "local",
    date: "2026-07-20",
    body: "",
    answers: [],
    completedByPack: {},
    skinId: "minimal",
    contentPackIds: ["prompts"],
    promptDraw: {},
    tags: [],
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z",
    ...over,
  };
}

const randomPack: ContentPack = {
  id: "prompts",
  name: "Prompts",
  version: "1",
  sections: [
    {
      id: "main",
      title: "Prompts",
      promptMode: "random",
      fields: [],
      pool: [field("a"), field("b"), field("c"), field("d"), field("e")],
      drawCount: 3,
    },
  ],
};

const mixedPack: ContentPack = {
  id: "mixed",
  name: "Mixed",
  version: "1",
  sections: [
    {
      id: "fixed",
      title: "Fixed",
      promptMode: "fixed",
      fields: [field("m1"), field("m2")],
    },
    {
      id: "random",
      title: "Random",
      promptMode: "random",
      fields: [],
      pool: [field("a"), field("b"), field("c"), field("d")],
      drawCount: 2,
    },
  ],
};

describe("ensurePromptDraw", () => {
  it("returns stored draw for same date and packId without reshuffling", () => {
    const entry = baseEntry({
      contentPackIds: ["prompts"],
      promptDraw: { prompts: { main: ["b", "d", "a"] } },
    });
    const rng = () => 0;

    const result = ensurePromptDraw(entry, randomPack, rng);

    expect(result.fieldIds).toEqual(["b", "d", "a"]);
    expect(result.entry).toBe(entry);
    expect(result.entry.promptDraw.prompts).toEqual({ main: ["b", "d", "a"] });
  });

  it("draws drawCount ids from pool on first call for a random section", () => {
    const entry = baseEntry();
    let i = 0;
    const rng = () => [0.1, 0.2, 0.3, 0.4][i++ % 4]!;

    const result = ensurePromptDraw(entry, randomPack, rng);

    expect(result.fieldIds).toHaveLength(3);
    expect(new Set(result.fieldIds).size).toBe(3);
    expect(result.entry.promptDraw.prompts).toEqual({ main: result.fieldIds });
  });

  it("throws when pool is smaller than drawCount", () => {
    const smallPoolPack: ContentPack = {
      ...randomPack,
      sections: [
        {
          id: "main",
          title: "Prompts",
          promptMode: "random",
          fields: [],
          pool: [field("a"), field("b")],
          drawCount: 3,
        },
      ],
    };

    expect(() => ensurePromptDraw(baseEntry(), smallPoolPack)).toThrow(
      "Pool too small for pack prompts",
    );
  });

  it("returns all field ids for fixed section without writing draw", () => {
    const fixedPack: ContentPack = {
      id: "sports",
      name: "Sports",
      version: "1",
      sections: [
        {
          id: "stats",
          title: "Stats",
          promptMode: "fixed",
          fields: [field("miles"), field("notes")],
        },
      ],
    };
    const entry = baseEntry({ contentPackIds: ["sports"] });

    const result = ensurePromptDraw(entry, fixedPack);

    expect(result.fieldIds).toEqual(["miles", "notes"]);
    expect(result.entry).toBe(entry);
    expect(result.entry.promptDraw.sports).toBeUndefined();
  });

  it("fills missing random section when pack has fixed and random sections", () => {
    const entry = baseEntry({ contentPackIds: ["mixed"], promptDraw: {} });
    let i = 0;
    const rng = () => [0.1, 0.2, 0.3, 0.4][i++ % 4]!;

    const result = ensurePromptDraw(entry, mixedPack, rng);

    expect(result.fieldIds).toHaveLength(4);
    expect(result.fieldIds.slice(0, 2)).toEqual(["m1", "m2"]);
    expect(result.entry.promptDraw.mixed?.random).toHaveLength(2);
    expect(result.entry.promptDraw.mixed?.fixed).toBeUndefined();
  });
});

describe("redrawPromptDraw", () => {
  it("replaces the draw for one section and clears answers for previous fields in that section", () => {
    const entry = baseEntry({
      promptDraw: { prompts: { main: ["a"] } },
      answers: [
        { fieldRef: "prompts:a", value: "old answer" },
        { fieldRef: "other:x", value: "keep" },
      ],
    });
    const singleDrawPack: ContentPack = {
      ...randomPack,
      sections: [
        {
          id: "main",
          title: "Prompts",
          promptMode: "random",
          fields: [],
          pool: [field("a"), field("b"), field("c"), field("d"), field("e")],
          drawCount: 1,
        },
      ],
    };
    let i = 0;
    const rng = () => [0.9, 0.1, 0.2, 0.3][i++ % 4]!;

    const next = redrawPromptDraw(entry, singleDrawPack, "main", rng);

    expect(next.promptDraw.prompts?.main).toHaveLength(1);
    expect(next.promptDraw.prompts?.main).not.toEqual(["a"]);
    expect(next.answers).toEqual([{ fieldRef: "other:x", value: "keep" }]);
  });

  it("redraws only the requested section and leaves other sections unchanged", () => {
    const entry = baseEntry({
      contentPackIds: ["mixed"],
      promptDraw: { mixed: { random: ["a", "b"], extra: ["x"] } },
      answers: [
        { fieldRef: "mixed:a", value: "keep random a" },
        { fieldRef: "mixed:x", value: "keep extra x" },
      ],
    });
    const twoRandomPack: ContentPack = {
      ...mixedPack,
      sections: [
        mixedPack.sections[1]!,
        {
          id: "extra",
          title: "Extra",
          promptMode: "random",
          fields: [],
          pool: [field("x"), field("y"), field("z")],
          drawCount: 1,
        },
      ],
    };
    let i = 0;
    const rng = () => [0.9, 0.1, 0.2][i++ % 3]!;

    const next = redrawPromptDraw(entry, twoRandomPack, "random", rng);

    expect(next.promptDraw.mixed?.extra).toEqual(["x"]);
    expect(next.promptDraw.mixed?.random).toHaveLength(2);
    expect(next.promptDraw.mixed?.random).not.toEqual(["a", "b"]);
    expect(next.answers).toEqual([{ fieldRef: "mixed:x", value: "keep extra x" }]);
  });
});
