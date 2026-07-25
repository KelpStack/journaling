import { describe, it, expect } from "vitest";
import { computeOverallStreak, computePackStreak, computePreferredAnswerStreak } from "./streaks";
import type { DailyEntry } from "./types";

function e(
  date: string,
  completedAt: string | undefined,
  pack?: Record<string, string>,
): DailyEntry {
  return {
    id: `local:${date}`,
    profileId: "local",
    date,
    body: "x",
    answers: [],
    completedByPack: pack ?? {},
    completedAt,
    skinId: "m",
    contentPackIds: [],
    promptDraw: {},
    tags: [],
    createdAt: completedAt ?? `${date}T12:00:00.000Z`,
    updatedAt: completedAt ?? `${date}T12:00:00.000Z`,
  };
}

describe("streaks", () => {
  it("counts contiguous journal dates for current streak", () => {
    const entries = [
      e("2026-07-20", "2026-07-20T10:00:00.000Z"),
      e("2026-07-21", "2026-07-21T10:00:00.000Z"),
      e("2026-07-22", "2026-07-22T09:00:00.000Z"),
    ];
    const s = computeOverallStreak(entries, {
      asOf: "2026-07-22",
      backdateRepairsStreak: true,
    });
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
  });

  it("counts backdated completion when repair on", () => {
    const entries = [
      e("2026-07-20", "2026-07-22T10:00:00.000Z"),
      e("2026-07-21", "2026-07-21T10:00:00.000Z"),
      e("2026-07-22", "2026-07-22T09:00:00.000Z"),
    ];
    const s = computeOverallStreak(entries, {
      asOf: "2026-07-22",
      backdateRepairsStreak: true,
    });
    expect(s.current).toBe(3);
  });

  it("ignores backdated completion for streak when repair off", () => {
    const entries = [
      e("2026-07-20", "2026-07-22T10:00:00.000Z"),
      e("2026-07-21", "2026-07-21T10:00:00.000Z"),
      e("2026-07-22", "2026-07-22T09:00:00.000Z"),
    ];
    const s = computeOverallStreak(entries, {
      asOf: "2026-07-22",
      backdateRepairsStreak: false,
    });
    expect(s.current).toBe(2); // 21 and 22 only
  });

  it("tracks longest streak across non-adjacent runs", () => {
    const entries = [
      e("2026-07-01", "2026-07-01T10:00:00.000Z"),
      e("2026-07-02", "2026-07-02T10:00:00.000Z"),
      e("2026-07-03", "2026-07-03T10:00:00.000Z"),
      e("2026-07-04", "2026-07-04T10:00:00.000Z"),
      e("2026-07-05", "2026-07-05T10:00:00.000Z"),
      e("2026-07-07", "2026-07-07T10:00:00.000Z"),
      e("2026-07-08", "2026-07-08T10:00:00.000Z"),
    ];
    const s = computeOverallStreak(entries, {
      asOf: "2026-07-08",
      backdateRepairsStreak: true,
    });
    expect(s.current).toBe(2);
    expect(s.longest).toBe(5);
  });

  it("returns zero when asOf has no counting entry", () => {
    const entries = [
      e("2026-07-20", "2026-07-20T10:00:00.000Z"),
      e("2026-07-21", "2026-07-21T10:00:00.000Z"),
    ];
    const s = computeOverallStreak(entries, {
      asOf: "2026-07-22",
      backdateRepairsStreak: true,
    });
    expect(s.current).toBe(0);
    expect(s.longest).toBe(2);
  });

  describe("computePackStreak", () => {
    it("uses completedByPack timestamp for backdate check", () => {
      const entries = [
        e("2026-07-20", undefined, { sports: "2026-07-22T10:00:00.000Z" }),
        e("2026-07-21", undefined, { sports: "2026-07-21T10:00:00.000Z" }),
        e("2026-07-22", undefined, { sports: "2026-07-22T09:00:00.000Z" }),
      ];
      const on = computePackStreak(entries, "sports", {
        asOf: "2026-07-22",
        backdateRepairsStreak: true,
      });
      expect(on.current).toBe(3);

      const off = computePackStreak(entries, "sports", {
        asOf: "2026-07-22",
        backdateRepairsStreak: false,
      });
      expect(off.current).toBe(2);
    });

    it("ignores overall completedAt when pack not completed", () => {
      const entries = [
        e("2026-07-22", "2026-07-22T09:00:00.000Z", {}),
      ];
      const s = computePackStreak(entries, "sports", {
        asOf: "2026-07-22",
        backdateRepairsStreak: true,
      });
      expect(s.current).toBe(0);
    });
  });

  describe("computePreferredAnswerStreak", () => {
    it("tracks preferred answer streak over matching dates only", () => {
      const entries = [
        {
          date: "2026-07-20",
          answers: [{ fieldRef: "p:y", value: true }],
        },
        {
          date: "2026-07-21",
          answers: [{ fieldRef: "p:y", value: false }],
        },
        {
          date: "2026-07-22",
          answers: [{ fieldRef: "p:y", value: true }],
        },
      ] as DailyEntry[];
      const s = computePreferredAnswerStreak(entries as DailyEntry[], "p:y", "yes", "2026-07-22");
      expect(s.current).toBe(1);
      expect(s.longest).toBe(1);
    });
  });
});
