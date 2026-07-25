import { describe, expect, it } from "vitest";
import { buildEntryAnswerLines, formatEntryTableDate } from "./entryTableRows";
import type { ContentPack, DailyEntry } from "./types";

const pack: ContentPack = {
  id: "travel-log",
  name: "Travel Log",
  version: "1",
  sections: [
    {
      id: "main",
      title: "Main",
      promptMode: "fixed",
      fields: [
        { id: "site", label: "Dive site", type: "shortText", required: false },
        { id: "depth", label: "Max depth", type: "number", required: false, unit: "m" },
        { id: "nitrox", label: "Nitrox", type: "yesNo", required: false },
        {
          id: "gear",
          label: "Gear",
          type: "checklist",
          required: false,
          options: [
            { id: "fins", label: "Fins" },
            { id: "torch", label: "Torch" },
          ],
        },
        { id: "notes", label: "Notes", type: "longText", required: false },
      ],
    },
  ],
};

function entry(over: Partial<DailyEntry> = {}): DailyEntry {
  return {
    id: "local:2026-07-22",
    profileId: "local",
    date: "2026-07-22",
    body: "",
    answers: [],
    completedByPack: {},
    skinId: "hfl-minimal",
    contentPackIds: ["travel-log"],
    promptDraw: {},
    tags: [],
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z",
    ...over,
  };
}

describe("formatEntryTableDate", () => {
  it("formats as locale short numeric date", () => {
    const formatted = formatEntryTableDate("2026-07-22");
    expect(formatted).toMatch(/\d{2}.\d{2}.\d{4}/);
  });
});

describe("buildEntryAnswerLines", () => {
  it("skips unanswered fields and includes free-write when present", () => {
    const lines = buildEntryAnswerLines(
      entry({
        body: "  Calm seas.  ",
        answers: [
          { fieldRef: "travel-log:site", value: "Cathedral Cove" },
          { fieldRef: "travel-log:notes", value: "" },
          { fieldRef: "travel-log:nitrox", value: null },
          { fieldRef: "travel-log:depth", value: 18 },
          { fieldRef: "travel-log:gear", value: { fins: true, torch: false } },
        ],
      }),
      [pack],
    );

    expect(lines).toEqual([
      { label: "Dive site", value: "Cathedral Cove", fieldRef: "travel-log:site" },
      { label: "Max depth", value: "18 m", fieldRef: "travel-log:depth" },
      { label: "Gear", value: "Fins", fieldRef: "travel-log:gear" },
      { label: "Free write", value: "Calm seas." },
    ]);
  });

  it("omits free-write when empty and formats yes/no", () => {
    const lines = buildEntryAnswerLines(
      entry({
        answers: [{ fieldRef: "travel-log:nitrox", value: false }],
      }),
      [pack],
    );
    expect(lines).toEqual([
      { label: "Nitrox", value: "No", fieldRef: "travel-log:nitrox" },
    ]);
  });

  it("when packId is set, only shows that pack's answers and skips free-write", () => {
    const other: ContentPack = {
      id: "hfl",
      name: "HFL",
      version: "1",
      sections: [
        {
          id: "main",
          title: "Main",
          promptMode: "fixed",
          fields: [
            { id: "surprise", label: "Surprise", type: "longText", required: false },
          ],
        },
      ],
    };

    const lines = buildEntryAnswerLines(
      entry({
        body: "Still show free write",
        answers: [
          { fieldRef: "hfl:surprise", value: "Dolphins" },
          { fieldRef: "travel-log:site", value: "Cathedral Cove" },
        ],
      }),
      [pack, other],
      { packId: "travel-log" },
    );

    expect(lines).toEqual([
      { label: "Dive site", value: "Cathedral Cove", fieldRef: "travel-log:site" },
      { label: "Free write", value: "Still show free write" },
    ]);
  });
});
