import { isAnswered, isChecklistAnswer } from "./completion";
import { parse } from "date-fns";
import { allPackFields } from "./normalizePack";
import type { AnswerValue, ContentPack, DailyEntry, PackField } from "./types";

export interface EntryAnswerLine {
  label: string;
  value: string;
  fieldRef?: string;
}

function fieldLookup(packs: ContentPack[]): Map<string, PackField> {
  const map = new Map<string, PackField>();
  for (const pack of packs) {
    for (const field of allPackFields(pack)) {
      map.set(`${pack.id}:${field.id}`, field);
    }
  }
  return map;
}

function formatAnswerValue(value: AnswerValue, field?: PackField): string {
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    const unit = field?.unit ? ` ${field.unit}` : "";
    return `${value}${unit}`;
  }
  if (isChecklistAnswer(value)) {
    const checked = Object.entries(value)
      .filter(([, on]) => on)
      .map(([id]) => {
        const option = field?.options?.find((item) => item.id === id);
        return option?.label ?? id;
      });
    return checked.join(", ");
  }
  return String(value);
}

/** Locale short numeric date (e.g. dd/mm/yyyy or mm/dd/yyyy per system). */
export function formatEntryTableDate(journalDate: string): string {
  const d = parse(journalDate, "yyyy-MM-dd", new Date());
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export interface BuildEntryAnswerLinesOptions {
  /** When set, only include answers for this pack (and omit free-write). */
  packId?: string;
}

/**
 * Right-column lines for the entries table: answered fields only, plus free-write
 * when non-empty. When packId is set, only that pack's answers are included;
 * free-write still appears. Values are not truncated.
 */
export function buildEntryAnswerLines(
  entry: DailyEntry,
  packs: ContentPack[],
  options: BuildEntryAnswerLinesOptions = {},
): EntryAnswerLine[] {
  const fields = fieldLookup(packs);
  const lines: EntryAnswerLine[] = [];
  const packPrefix = options.packId ? `${options.packId}:` : null;

  for (const answer of entry.answers) {
    if (packPrefix && !answer.fieldRef.startsWith(packPrefix)) continue;
    const field = fields.get(answer.fieldRef);
    const type = field?.type ?? "longText";
    if (!isAnswered(answer.value, type)) continue;
    if (answer.value === null || answer.value === undefined) continue;

    lines.push({
      label: field?.label ?? answer.fieldRef.split(":")[1] ?? answer.fieldRef,
      value: formatAnswerValue(answer.value, field),
      fieldRef: answer.fieldRef,
    });
  }

  const body = entry.body.trim();
  if (body.length > 0) {
    lines.push({ label: "Free write", value: body });
  }

  return lines;
}
