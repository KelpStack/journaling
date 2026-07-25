import { describe, it, expect } from "vitest";
import {
  aggregateNumberField,
  aggregateYesNoField,
  countLongTextField,
} from "./stats";
import type { DailyEntry } from "./types";

describe("stats", () => {
  it("does not treat unanswered number as 0", () => {
    const entries = [
      { answers: [{ fieldRef: "p:n", value: 2 }] },
      { answers: [{ fieldRef: "p:n", value: null }] },
      { answers: [] },
    ] as DailyEntry[];
    const r = aggregateNumberField(entries as DailyEntry[], "p:n");
    expect(r.count).toBe(1);
    expect(r.sum).toBe(2);
    expect(r.avg).toBe(2);
  });

  it("tracks yes and no rates only over answered", () => {
    const entries = [
      { answers: [{ fieldRef: "p:y", value: true }] },
      { answers: [{ fieldRef: "p:y", value: false }] },
      { answers: [{ fieldRef: "p:y", value: null }] },
    ] as DailyEntry[];
    const r = aggregateYesNoField(entries as DailyEntry[], "p:y");
    expect(r.yesCount).toBe(1);
    expect(r.noCount).toBe(1);
    expect(r.yesRate).toBe(0.5);
    expect(r.noRate).toBe(0.5);
  });

  it("counts long text only when non-empty", () => {
    const entries = [
      { answers: [{ fieldRef: "p:t", value: "hello" }] },
      { answers: [{ fieldRef: "p:t", value: "  " }] },
      { answers: [{ fieldRef: "p:t", value: null }] },
      { answers: [] },
    ] as DailyEntry[];
    expect(countLongTextField(entries as DailyEntry[], "p:t")).toBe(1);
  });

  it("computes min and max over answered numbers only", () => {
    const entries = [
      { answers: [{ fieldRef: "p:n", value: 5 }] },
      { answers: [{ fieldRef: "p:n", value: 1 }] },
      { answers: [{ fieldRef: "p:n", value: null }] },
    ] as DailyEntry[];
    const r = aggregateNumberField(entries as DailyEntry[], "p:n");
    expect(r.min).toBe(1);
    expect(r.max).toBe(5);
  });
});
