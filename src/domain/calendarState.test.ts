import { describe, expect, it } from "vitest";
import type { DailyEntry } from "./types";
import {
  buildMonthGrid,
  dayStateFromEntry,
  firstOfMonth,
  monthRangeForGrid,
} from "./calendarState";

function baseEntry(over: Partial<DailyEntry> = {}): DailyEntry {
  return {
    id: "local:2026-07-22",
    profileId: "local",
    date: "2026-07-22",
    body: "",
    answers: [],
    completedByPack: {},
    skinId: "hfl-minimal",
    contentPackIds: ["hfl"],
    promptDraw: {},
    tags: [],
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z",
    ...over,
  };
}

describe("dayStateFromEntry", () => {
  it("returns empty when no entry", () => {
    expect(dayStateFromEntry(undefined)).toEqual({
      state: "empty",
      completedPackIds: [],
    });
  });

  it("returns draft when entry exists without overall completion", () => {
    const entry = baseEntry({
      completedByPack: { hfl: "2026-07-22T12:00:00.000Z" },
    });

    expect(dayStateFromEntry(entry)).toEqual({
      state: "draft",
      completedPackIds: ["hfl"],
    });
  });

  it("returns completed when completedAt is set", () => {
    const entry = baseEntry({
      completedByPack: { hfl: "2026-07-22T12:00:00.000Z" },
      completedAt: "2026-07-22T18:00:00.000Z",
    });

    expect(dayStateFromEntry(entry).state).toBe("completed");
  });
});

describe("buildMonthGrid", () => {
  it("maps entries by journal date, not createdAt", () => {
    const monthStart = firstOfMonth("2026-07-15");
    const entriesByDate = new Map<string, DailyEntry>([
      [
        "2026-07-10",
        baseEntry({
          date: "2026-07-10",
          id: "local:2026-07-10",
          createdAt: "2026-08-01T00:00:00.000Z",
          completedAt: "2026-08-01T00:00:00.000Z",
        }),
      ],
    ]);

    const cells = buildMonthGrid(monthStart, entriesByDate);
    const july10 = cells.find((cell) => cell.date === "2026-07-10");

    expect(july10?.state).toBe("completed");
  });

  it("covers the visible grid range for listEntriesInRange", () => {
    const monthStart = firstOfMonth("2026-07-01");
    const { start, end } = monthRangeForGrid(monthStart);
    const cells = buildMonthGrid(monthStart, new Map());

    expect(cells[0]?.date).toBe(start);
    expect(cells.at(-1)?.date).toBe(end);
  });
});
