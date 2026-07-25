import { describe, expect, it } from "vitest";
import { normalizePack, normalizePackPromptDraw } from "./normalizePack";
import type { ContentPack } from "./types";

const legacy: ContentPack = {
  id: "hfl",
  name: "Homework for Life",
  version: "2.0.0",
  promptMode: "random",
  drawCount: 1,
  fields: [{ id: "surprise", label: "Surprise", type: "longText", required: true }],
  pool: [{ id: "surprise", label: "Surprise", type: "longText", required: true }],
  sections: [],
};

describe("normalizePack", () => {
  it("wraps legacy top-level fields into one section", () => {
    const n = normalizePack(legacy);
    expect(n.sections).toHaveLength(1);
    expect(n.sections[0]).toMatchObject({
      id: "main",
      promptMode: "random",
      drawCount: 1,
    });
    expect(n.sections[0]?.fields[0]?.id).toBe("surprise");
  });

  it("passes through existing sections", () => {
    const modern: ContentPack = {
      id: "x",
      name: "X",
      version: "1",
      sections: [
        {
          id: "a",
          title: "A",
          promptMode: "fixed",
          fields: [{ id: "m", label: "Mood", type: "shortText", required: false }],
        },
      ],
    };
    expect(normalizePack(modern).sections).toHaveLength(1);
    expect(normalizePack(modern).sections[0]?.id).toBe("a");
  });
});

describe("normalizePackPromptDraw", () => {
  it("maps legacy string[] onto the first random section", () => {
    const pack = normalizePack(legacy);
    const draw = normalizePackPromptDraw(pack, ["surprise"]);
    expect(draw).toEqual({ main: ["surprise"] });
  });

  it("passes through section-keyed draws", () => {
    const pack = normalizePack(legacy);
    expect(normalizePackPromptDraw(pack, { main: ["surprise"] })).toEqual({
      main: ["surprise"],
    });
  });

  it("remaps legacy main draw onto the first random section when pack has no main section", () => {
    const modern: ContentPack = {
      id: "hfl",
      name: "Homework for Life",
      version: "3.0.0",
      sections: [
        {
          id: "reflection",
          title: "Reflection",
          promptMode: "random",
          drawCount: 1,
          fields: [{ id: "surprise", label: "Surprise", type: "longText", required: true }],
          pool: [{ id: "surprise", label: "Surprise", type: "longText", required: true }],
        },
      ],
    };
    expect(normalizePackPromptDraw(modern, { main: ["surprise"] })).toEqual({
      reflection: ["surprise"],
    });
  });

  it("maps legacy string[] onto the sole fixed section when no random section exists", () => {
    const fixedOnly: ContentPack = {
      id: "fixed",
      name: "Fixed Only",
      version: "1",
      sections: [
        {
          id: "main",
          title: "Main",
          promptMode: "fixed",
          fields: [{ id: "mood", label: "Mood", type: "shortText", required: false }],
        },
      ],
    };
    expect(normalizePackPromptDraw(fixedOnly, ["mood"])).toEqual({ main: ["mood"] });
  });
});
