import { isAnswered } from "./completion";
import type { DailyEntry } from "./types";

export interface NumberFieldStats {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
}

export interface YesNoFieldStats {
  yesCount: number;
  noCount: number;
  yesRate: number;
  noRate: number;
}

function valueForField(entry: DailyEntry, ref: string) {
  return entry.answers.find((a) => a.fieldRef === ref)?.value ?? null;
}

export function aggregateNumberField(
  entries: DailyEntry[],
  fieldRef: string,
): NumberFieldStats {
  const values: number[] = [];
  for (const entry of entries) {
    const value = valueForField(entry, fieldRef);
    if (isAnswered(value, "number") && typeof value === "number") {
      values.push(value);
    }
  }

  if (values.length === 0) {
    return { count: 0, sum: 0, avg: 0, min: 0, max: 0 };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    sum,
    avg: sum / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function aggregateYesNoField(
  entries: DailyEntry[],
  fieldRef: string,
): YesNoFieldStats {
  let yesCount = 0;
  let noCount = 0;

  for (const entry of entries) {
    const value = valueForField(entry, fieldRef);
    if (!isAnswered(value, "yesNo")) continue;
    if (value === true) yesCount++;
    else if (value === false) noCount++;
  }

  const answered = yesCount + noCount;
  if (answered === 0) {
    return { yesCount: 0, noCount: 0, yesRate: 0, noRate: 0 };
  }

  return {
    yesCount,
    noCount,
    yesRate: yesCount / answered,
    noRate: noCount / answered,
  };
}

export function countLongTextField(entries: DailyEntry[], fieldRef: string): number {
  let count = 0;
  for (const entry of entries) {
    const value = valueForField(entry, fieldRef);
    if (isAnswered(value, "longText")) count++;
  }
  return count;
}
