import type { AnswerValue, ChecklistAnswer, ContentPack, DailyEntry, FieldType } from "./types";
import { isJournalDate } from "./dates";
import { fieldsForPackOnDay } from "./mergePacks";
import { fieldRef } from "./fieldRef";
import { normalizePackPromptDraw } from "./normalizePack";

export function isChecklistAnswer(value: AnswerValue | null | undefined): value is ChecklistAnswer {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isAnswered(value: AnswerValue | null | undefined, type: FieldType): boolean {
  if (value === null || value === undefined) return false;
  if (type === "longText" || type === "shortText") {
    return String(value).trim().length > 0;
  }
  if (type === "date") {
    return typeof value === "string" && isJournalDate(value);
  }
  if (type === "number") return typeof value === "number" && !Number.isNaN(value);
  if (type === "yesNo") return typeof value === "boolean";
  if (type === "checklist") {
    if (!isChecklistAnswer(value)) return false;
    return Object.values(value).some(Boolean);
  }
  return false;
}

/** Required checklist: every option must be checked. */
export function isChecklistComplete(
  value: AnswerValue | null | undefined,
  optionIds: string[],
): boolean {
  if (!isChecklistAnswer(value) || optionIds.length === 0) return false;
  return optionIds.every((id) => value[id] === true);
}

export function packRequirementsMet(
  entry: DailyEntry,
  pack: ContentPack,
): boolean {
  const draw = normalizePackPromptDraw(pack, entry.promptDraw[pack.id] as unknown);
  const fields = fieldsForPackOnDay(pack, draw);
  for (const field of fields) {
    if (!field.required) continue;
    const ans = entry.answers.find((a) => a.fieldRef === fieldRef(pack.id, field.id));
    if (field.type === "checklist") {
      const ids = (field.options ?? []).map((o) => o.id);
      if (!isChecklistComplete(ans?.value ?? null, ids)) return false;
      continue;
    }
    if (!isAnswered(ans?.value ?? null, field.type)) return false;
  }
  return true;
}

export function applyStickyCompletion(
  entry: DailyEntry,
  activePacks: ContentPack[],
  opts: {
    requireFreeWrite: boolean;
    nowIso: string;
    /** When false, free-write is hidden so requireFreeWrite does not apply. */
    showFreeWrite?: boolean;
  },
): DailyEntry {
  const completedByPack = { ...entry.completedByPack };
  for (const pack of activePacks) {
    if (completedByPack[pack.id]) continue;
    if (packRequirementsMet(entry, pack)) {
      completedByPack[pack.id] = opts.nowIso;
    }
  }

  let completedAt = entry.completedAt;
  if (!completedAt) {
    const packsOk = activePacks.every((p) => completedByPack[p.id]);
    const hide =
      opts.showFreeWrite === false || activePacks.some((p) => p.hideFreeWrite);
    const freeSatisfied = hide || !opts.requireFreeWrite || entry.body.trim().length > 0;
    if (packsOk && freeSatisfied) completedAt = opts.nowIso;
  }

  return { ...entry, completedByPack, completedAt };
}

/** True when the entry has body text or any non-empty answer. */
export function entryHasUserContent(entry: DailyEntry): boolean {
  if (entry.body.trim().length > 0) return true;
  for (const answer of entry.answers) {
    if (answer.value === null || answer.value === undefined) continue;
    if (typeof answer.value === "string" && answer.value.trim().length === 0) continue;
    if (isChecklistAnswer(answer.value)) {
      if (Object.values(answer.value).some(Boolean)) return true;
      continue;
    }
    return true;
  }
  return false;
}
