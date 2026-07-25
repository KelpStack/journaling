import { beforeEach, describe, expect, it } from "vitest";
import type { DailyEntry } from "../domain/types";
import { db, type SearchRecord } from "./database";
import {
  buildSearchRecord,
  buildSearchSnippet,
  matchesSearchFilters,
  searchEntries,
  upsertSearchIndex,
} from "./searchIndex";

function makeEntry(overrides: Partial<DailyEntry> & Pick<DailyEntry, "date">): DailyEntry {
  const { date, ...rest } = overrides;
  const id = `local:${date}`;
  return {
    id,
    profileId: "local",
    date,
    body: "",
    answers: [],
    completedByPack: {},
    skinId: "hfl-minimal",
    contentPackIds: ["hfl"],
    promptDraw: {},
    tags: [],
    createdAt: "2026-07-01T12:00:00.000Z",
    updatedAt: "2026-07-01T12:00:00.000Z",
    ...rest,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("buildSearchRecord", () => {
  it("stores filter metadata from entry", () => {
    const record = buildSearchRecord(
      makeEntry({
        date: "2026-07-10",
        body: "Rainy day",
        contentPackIds: ["hfl", "dives"],
        completedAt: "2026-07-10T20:00:00.000Z",
        answers: [
          { fieldRef: "dives:depth", value: 18 },
          { fieldRef: "dives:night", value: true },
        ],
      }),
    );

    expect(record).toMatchObject({
      date: "2026-07-10",
      text: "Rainy day 18 true",
      contentPackIds: ["hfl", "dives"],
      completed: true,
      answers: { "dives:depth": 18, "dives:night": true },
    });
  });
});

describe("searchEntries", () => {
  beforeEach(async () => {
    await upsertSearchIndex(
      makeEntry({
        date: "2026-07-01",
        body: "Quiet morning",
        completedAt: "2026-07-01T20:00:00.000Z",
      }),
    );
    await upsertSearchIndex(
      makeEntry({
        date: "2026-07-05",
        body: "Surprised by dolphins",
        answers: [{ fieldRef: "hfl:surprise", value: "Dolphins at the pier" }],
      }),
    );
    await upsertSearchIndex(
      makeEntry({
        date: "2026-07-10",
        body: "Deep dive day",
        contentPackIds: ["dives"],
        completedAt: "2026-07-10T20:00:00.000Z",
        answers: [
          { fieldRef: "dives:depth", value: 24 },
          { fieldRef: "dives:night", value: false },
        ],
      }),
    );
  });

  it("finds entries by text query", async () => {
    const results = await searchEntries("local", { query: "dolphins" });

    expect(results).toHaveLength(1);
    expect(results[0]?.date).toBe("2026-07-05");
    expect(results[0]?.fieldRef).toBe("hfl:surprise");
  });

  it("filters by date range", async () => {
    const results = await searchEntries("local", {
      dateFrom: "2026-07-05",
      dateTo: "2026-07-09",
    });

    expect(results.map((row) => row.date)).toEqual(["2026-07-05"]);
  });

  it("filters by pack id using answered field refs (not snapshot contentPackIds alone)", async () => {
    // 2026-07-01 has contentPackIds hfl but no hfl answers — excluded.
    const byHflAnswers = await searchEntries("local", { packId: "hfl" });
    expect(byHflAnswers.map((row) => row.date)).toEqual(["2026-07-05"]);

    const byDiveAnswers = await searchEntries("local", { packId: "dives" });
    expect(byDiveAnswers.map((row) => row.date)).toEqual(["2026-07-10"]);
  });

  it("filters by completed and draft", async () => {
    const completed = await searchEntries("local", { completion: "completed" });
    expect(completed.map((row) => row.date).sort()).toEqual(["2026-07-01", "2026-07-10"]);

    const draft = await searchEntries("local", { completion: "draft" });
    expect(draft.map((row) => row.date)).toEqual(["2026-07-05"]);
  });

  it("filters by yes/no field value", async () => {
    const yesResults = await searchEntries("local", {
      yesNoFieldRef: "dives:night",
      yesNoValue: true,
    });
    expect(yesResults).toHaveLength(0);

    const noResults = await searchEntries("local", {
      yesNoFieldRef: "dives:night",
      yesNoValue: false,
    });
    expect(noResults.map((row) => row.date)).toEqual(["2026-07-10"]);
  });

  it("filters by number min and max", async () => {
    const inRange = await searchEntries("local", {
      numberFieldRef: "dives:depth",
      numberMin: 20,
      numberMax: 30,
    });
    expect(inRange.map((row) => row.date)).toEqual(["2026-07-10"]);

    const outOfRange = await searchEntries("local", {
      numberFieldRef: "dives:depth",
      numberMin: 30,
    });
    expect(outOfRange).toHaveLength(0);
  });

  it("sorts results by date descending", async () => {
    const results = await searchEntries("local", {});
    expect(results.map((row) => row.date)).toEqual(["2026-07-10", "2026-07-05", "2026-07-01"]);
  });

  it("does not throw on text search for legacy index rows missing new fields", async () => {
    await db.search.put({
      id: "local:2026-06-15",
      profileId: "local",
      date: "2026-06-15",
      text: "Legacy entry about sunshine",
    } as SearchRecord);

    await expect(searchEntries("local", { query: "sunshine" })).resolves.toEqual([
      expect.objectContaining({
        date: "2026-06-15",
        snippet: expect.stringContaining("sunshine"),
      }),
    ]);
  });
});

describe("buildSearchSnippet", () => {
  it("highlights query context in snippet", () => {
    const record = buildSearchRecord(
      makeEntry({
        date: "2026-07-05",
        body: "A long day with dolphins near the pier",
      }),
    );

    expect(buildSearchSnippet(record, "dolphins")).toContain("dolphins");
  });
});

describe("matchesSearchFilters", () => {
  it("requires numeric answer when number filter is set", () => {
    const record = buildSearchRecord(
      makeEntry({
        date: "2026-07-05",
        answers: [{ fieldRef: "dives:depth", value: "not-a-number" as unknown as number }],
      }),
    );

    expect(
      matchesSearchFilters(record, {
        numberFieldRef: "dives:depth",
        numberMin: 0,
      }),
    ).toBe(false);
  });
});
