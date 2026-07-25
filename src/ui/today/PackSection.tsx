import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { isChecklistAnswer } from "../../domain/completion";
import { fieldsForSectionOnDay } from "../../domain/mergePacks";
import { allPackFields, normalizePack, normalizePackPromptDraw } from "../../domain/normalizePack";
import { fieldRef, parseFieldRef } from "../../domain/fieldRef";
import type {
  AnswerValue,
  ChecklistAnswer,
  ContentPack,
  DailyEntry,
  PackField,
  PackSection as PackSectionDef,
} from "../../domain/types";

interface PackSectionProps {
  pack: ContentPack;
  entry: DailyEntry;
  collapsed: boolean;
  autoFocusFirst?: boolean;
  focusFieldRef?: string | null;
  onToggleCollapse: () => void;
  onAnswerChange: (ref: string, value: AnswerValue | null) => void;
  onRedrawPrompt?: (sectionId: string) => void;
}

function answerValue(entry: DailyEntry, ref: string): AnswerValue | null {
  return entry.answers.find((item) => item.fieldRef === ref)?.value ?? null;
}

function hasAnswer(value: AnswerValue | null, type: PackField["type"]): boolean {
  if (value === null || value === undefined) return false;
  if (type === "longText" || type === "shortText" || type === "date") {
    return String(value).trim().length > 0;
  }
  if (type === "checklist") {
    return isChecklistAnswer(value) && Object.values(value).some(Boolean);
  }
  return true;
}

function FieldInput({
  field,
  fieldId,
  value,
  autoFocus,
  showRedraw,
  onChange,
  onRedraw,
}: {
  field: PackField;
  fieldId: string;
  value: AnswerValue | null;
  autoFocus?: boolean;
  showRedraw?: boolean;
  onChange: (value: AnswerValue | null) => void;
  onRedraw?: () => void;
}) {
  const requiredMark = field.required ? (
    <span className="field-label__required" aria-hidden="true">
      *
    </span>
  ) : null;

  const redrawButton =
    showRedraw && onRedraw ? (
      <button
        type="button"
        className="field-redraw"
        aria-label="Draw a different prompt"
        title="New prompt"
        onClick={() => {
          if (
            hasAnswer(value, field.type) &&
            !window.confirm(
              "This prompt already has an answer. Redraw and clear it?",
            )
          ) {
            return;
          }
          onRedraw();
        }}
      >
        <RefreshCw size={15} strokeWidth={1.75} aria-hidden />
      </button>
    ) : null;

  const labelRow = (labelText: string) => (
    <span className="field-label-row">
      <span className="field-label">
        {labelText}
        {field.unit ? ` (${field.unit})` : ""}
        {requiredMark}
      </span>
      {redrawButton}
    </span>
  );

  if (field.type === "longText") {
    return (
      <label className="field" id={fieldId}>
        {labelRow(field.label)}
        <textarea
          className="field-input field-input--textarea"
          value={typeof value === "string" ? value : ""}
          rows={4}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          aria-required={field.required}
        />
      </label>
    );
  }

  if (field.type === "shortText") {
    return (
      <label className="field" id={fieldId}>
        {labelRow(field.label)}
        <input
          className="field-input field-input--short"
          type="text"
          value={typeof value === "string" ? value : ""}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          aria-required={field.required}
        />
      </label>
    );
  }

  if (field.type === "date") {
    return (
      <label className="field" id={fieldId}>
        {labelRow(field.label)}
        <input
          className="field-input field-input--date"
          type="date"
          value={typeof value === "string" ? value : ""}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value || null)}
          aria-required={field.required}
        />
      </label>
    );
  }

  if (field.type === "number") {
    return (
      <label className="field" id={fieldId}>
        {labelRow(field.label)}
        <input
          className="field-input"
          type="number"
          value={typeof value === "number" ? value : ""}
          min={field.min}
          max={field.max}
          autoFocus={autoFocus}
          onChange={(event) => {
            const raw = event.target.value;
            onChange(raw === "" ? null : Number(raw));
          }}
          aria-required={field.required}
        />
      </label>
    );
  }

  if (field.type === "checklist") {
    const options = field.options ?? [];
    const checked: ChecklistAnswer = isChecklistAnswer(value) ? value : {};
    return (
      <fieldset className="field field--checklist" id={fieldId}>
        <legend className="field-label-row">
          <span className="field-label">
            {field.label}
            {requiredMark}
          </span>
          {redrawButton}
        </legend>
        <ul className="checklist">
          {options.map((option, index) => (
            <li key={option.id} className="checklist__item">
              <label className="checklist__label">
                <input
                  type="checkbox"
                  className="checklist__input"
                  checked={!!checked[option.id]}
                  autoFocus={autoFocus && index === 0}
                  onChange={(event) => {
                    const next: ChecklistAnswer = {
                      ...checked,
                      [option.id]: event.target.checked,
                    };
                    onChange(next);
                  }}
                />
                <span>{option.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    );
  }

  return (
    <fieldset className="field field--yes-no" id={fieldId}>
      <legend className="field-label-row">
        <span className="field-label">
          {field.label}
          {requiredMark}
        </span>
        {redrawButton}
      </legend>
      <div className="yes-no-buttons">
        <button
          type="button"
          className={value === true ? "yes-no-btn yes-no-btn--active" : "yes-no-btn"}
          autoFocus={autoFocus}
          onClick={() => onChange(true)}
        >
          Yes
        </button>
        <button
          type="button"
          className={value === false ? "yes-no-btn yes-no-btn--active" : "yes-no-btn"}
          onClick={() => onChange(false)}
        >
          No
        </button>
        {value !== null && (
          <button
            type="button"
            className="yes-no-btn yes-no-btn--clear"
            onClick={() => onChange(null)}
          >
            Clear
          </button>
        )}
      </div>
    </fieldset>
  );
}

function SectionPanel({
  section,
  packId,
  packDraw,
  entry,
  collapsed,
  autoFocusFirst,
  onToggleCollapse,
  onAnswerChange,
  onRedrawPrompt,
}: {
  section: PackSectionDef;
  packId: string;
  packDraw: Record<string, string[]>;
  entry: DailyEntry;
  collapsed: boolean;
  autoFocusFirst: boolean;
  onToggleCollapse: () => void;
  onAnswerChange: (ref: string, value: AnswerValue | null) => void;
  onRedrawPrompt?: (sectionId: string) => void;
}) {
  const fields = fieldsForSectionOnDay(section, packDraw[section.id]);
  const canRedraw = section.promptMode === "random" && !!onRedrawPrompt;

  return (
    <div className="pack-section__section">
      <header className="pack-section__section-header">
        <button
          type="button"
          className="pack-section__section-toggle"
          aria-expanded={!collapsed}
          onClick={onToggleCollapse}
        >
          <span className="pack-section__chevron" aria-hidden="true">
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="pack-section__section-title">{section.title}</span>
        </button>
      </header>
      {!collapsed && (
        <div className="pack-section__section-body">
          {fields.map((field, index) => {
            const ref = fieldRef(packId, field.id);
            return (
              <FieldInput
                key={ref}
                field={field}
                fieldId={`field-${ref}`}
                value={answerValue(entry, ref)}
                autoFocus={autoFocusFirst && index === 0}
                showRedraw={canRedraw && index === 0}
                onChange={(next) => onAnswerChange(ref, next)}
                onRedraw={
                  onRedrawPrompt ? () => onRedrawPrompt(section.id) : undefined
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function sectionIdForField(
  pack: ReturnType<typeof normalizePack>,
  fieldId: string,
): string | undefined {
  for (const section of pack.sections) {
    const fields =
      section.promptMode === "random"
        ? [...(section.pool ?? []), ...section.fields]
        : section.fields;
    if (fields.some((field) => field.id === fieldId)) {
      return section.id;
    }
  }
  return undefined;
}

export function PackSection({
  pack: rawPack,
  entry,
  collapsed,
  autoFocusFirst = false,
  focusFieldRef = null,
  onToggleCollapse,
  onAnswerChange,
  onRedrawPrompt,
}: PackSectionProps) {
  const pack = normalizePack(rawPack);
  const packDraw = normalizePackPromptDraw(pack, entry.promptDraw[pack.id] as unknown);

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setCollapsedSections(new Set());
  }, [pack.id, entry.date]);

  useEffect(() => {
    if (!focusFieldRef || collapsed) {
      return;
    }
    let fieldId: string;
    let packId: string;
    try {
      ({ packId, fieldId } = parseFieldRef(focusFieldRef));
    } catch {
      return;
    }
    if (packId !== pack.id) {
      return;
    }
    if (!allPackFields(rawPack).some((field) => field.id === fieldId)) {
      return;
    }
    const sectionId = sectionIdForField(pack, fieldId);
    if (!sectionId) {
      return;
    }
    setCollapsedSections((current) => {
      if (!current.has(sectionId)) {
        return current;
      }
      const next = new Set(current);
      next.delete(sectionId);
      return next;
    });
  }, [collapsed, focusFieldRef, pack, rawPack]);

  const toggleSectionCollapse = (sectionId: string) => {
    setCollapsedSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  let focusAssigned = false;

  return (
    <section id={`pack-${pack.id}`} className="pack-section">
      <header className="pack-section__header">
        <button
          type="button"
          className="pack-section__toggle"
          aria-expanded={!collapsed}
          onClick={onToggleCollapse}
        >
          <span className="pack-section__chevron" aria-hidden="true">
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="pack-section__title">{pack.name}</span>
        </button>
      </header>
      {!collapsed && (
        <div className="pack-section__body">
          {pack.sections.map((section) => {
            const sectionCollapsed = collapsedSections.has(section.id);
            const sectionAutoFocus =
              autoFocusFirst && !focusAssigned && !sectionCollapsed;
            if (sectionAutoFocus) {
              focusAssigned = true;
            }
            return (
              <SectionPanel
                key={section.id}
                section={section}
                packId={pack.id}
                packDraw={packDraw}
                entry={entry}
                collapsed={sectionCollapsed}
                autoFocusFirst={sectionAutoFocus}
                onToggleCollapse={() => toggleSectionCollapse(section.id)}
                onAnswerChange={onAnswerChange}
                onRedrawPrompt={onRedrawPrompt}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
