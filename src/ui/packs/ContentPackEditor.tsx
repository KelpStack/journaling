import { useState } from "react";
import { normalizePack } from "../../domain/normalizePack";
import type {
  ContentPack,
  FieldType,
  PackField,
  PackSection,
  PromptMode,
} from "../../domain/types";

export interface ContentPackEditorProps {
  initial: ContentPack;
  onSave: (pack: ContentPack) => Promise<void>;
  onCancel: () => void;
}

const FIELD_TYPES: FieldType[] = [
  "longText",
  "shortText",
  "date",
  "number",
  "yesNo",
  "checklist",
];
const PROMPT_MODES: PromptMode[] = ["fixed", "random"];

function emptyField(): PackField {
  return {
    id: "",
    label: "",
    type: "longText",
    required: false,
  };
}

function emptySection(): PackSection {
  return {
    id: "",
    title: "",
    promptMode: "fixed",
    fields: [emptyField()],
  };
}

function emptyPack(): ContentPack {
  return {
    id: "",
    name: "",
    version: "1.0.0",
    sections: [emptySection()],
  };
}

function normalizeField(field: PackField): PackField {
  return {
    ...field,
    id: field.id.trim(),
    label: field.label.trim(),
    stats: field.type === "checklist" ? undefined : field.stats,
    options:
      field.type === "checklist"
        ? (field.options ?? []).map((option) => ({
            id: option.id.trim(),
            label: option.label.trim(),
          }))
        : undefined,
  };
}

function validateFields(fields: PackField[]): string | null {
  if (fields.length === 0) {
    return "Each section needs at least one field";
  }

  for (const field of fields) {
    if (!field.id.trim() || !field.label.trim()) {
      return "Each field needs an id and label";
    }
    if (field.type === "checklist") {
      const options = field.options ?? [];
      if (options.length === 0) {
        return `Checklist "${field.label || field.id}" needs at least one item`;
      }
      for (const option of options) {
        if (!option.id.trim() || !option.label.trim()) {
          return "Each checklist item needs an id and label";
        }
      }
    }
  }

  return null;
}

export function createEmptyContentPack(): ContentPack {
  return emptyPack();
}

export function ContentPackEditor({
  initial,
  onSave,
  onCancel,
}: ContentPackEditorProps) {
  const [pack, setPack] = useState<ContentPack>(() => normalizePack(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSection = (sectionIndex: number, patch: Partial<PackSection>) => {
    setPack((current) => {
      const sections = [...current.sections];
      sections[sectionIndex] = { ...sections[sectionIndex]!, ...patch };
      return { ...current, sections };
    });
  };

  const updateField = (
    sectionIndex: number,
    fieldIndex: number,
    patch: Partial<PackField>,
  ) => {
    setPack((current) => {
      const sections = [...current.sections];
      const section = sections[sectionIndex]!;
      const fields = [...section.fields];
      fields[fieldIndex] = { ...fields[fieldIndex]!, ...patch };
      sections[sectionIndex] = { ...section, fields };
      return { ...current, sections };
    });
  };

  const addField = (sectionIndex: number) => {
    setPack((current) => {
      const sections = [...current.sections];
      const section = sections[sectionIndex]!;
      sections[sectionIndex] = {
        ...section,
        fields: [...section.fields, emptyField()],
      };
      return { ...current, sections };
    });
  };

  const removeField = (sectionIndex: number, fieldIndex: number) => {
    setPack((current) => {
      const sections = [...current.sections];
      const section = sections[sectionIndex]!;
      sections[sectionIndex] = {
        ...section,
        fields: section.fields.filter((_, i) => i !== fieldIndex),
      };
      return { ...current, sections };
    });
  };

  const addSection = () => {
    setPack((current) => ({
      ...current,
      sections: [...current.sections, emptySection()],
    }));
  };

  const removeSection = (sectionIndex: number) => {
    if (pack.sections.length <= 1) return;
    setPack((current) => ({
      ...current,
      sections: current.sections.filter((_, i) => i !== sectionIndex),
    }));
  };

  const moveSection = (sectionIndex: number, direction: -1 | 1) => {
    const target = sectionIndex + direction;
    if (target < 0 || target >= pack.sections.length) return;
    setPack((current) => {
      const sections = [...current.sections];
      const [moved] = sections.splice(sectionIndex, 1);
      sections.splice(target, 0, moved!);
      return { ...current, sections };
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!pack.id.trim() || !pack.name.trim()) {
      setError("Id and name are required");
      return;
    }

    for (const section of pack.sections) {
      if (!section.id.trim() || !section.title.trim()) {
        setError("Each section needs an id and title");
        return;
      }

      const fieldError = validateFields(section.fields);
      if (fieldError) {
        setError(fieldError);
        return;
      }
    }

    const normalizedSections = pack.sections.map((section) => ({
      ...section,
      id: section.id.trim(),
      title: section.title.trim(),
      fields: section.fields.map(normalizeField),
    }));

    const normalizedPack: ContentPack = {
      ...pack,
      id: pack.id.trim(),
      name: pack.name.trim(),
      sections: normalizedSections,
    };

    const seenSectionIds = new Set<string>();
    for (const section of normalizedPack.sections) {
      if (seenSectionIds.has(section.id)) {
        setError(`Duplicate section id "${section.id}"`);
        return;
      }
      seenSectionIds.add(section.id);

      if (section.promptMode === "random") {
        const drawCount = section.drawCount ?? 1;
        if (drawCount > section.fields.length) {
          setError(
            `Section "${section.title || section.id}": draw count (${drawCount}) cannot exceed field count (${section.fields.length})`,
          );
          return;
        }
      }
    }

    const seenFieldIds = new Set<string>();
    for (const section of normalizedPack.sections) {
      for (const field of section.fields) {
        if (seenFieldIds.has(field.id)) {
          setError(`Duplicate field id "${field.id}"`);
          return;
        }
        seenFieldIds.add(field.id);
      }
    }

    const toSave: ContentPack = {
      id: normalizedPack.id,
      name: normalizedPack.name,
      version: normalizedPack.version,
      description: normalizedPack.description,
      hideFreeWrite: normalizedPack.hideFreeWrite,
      sections: normalizedPack.sections.map((section) =>
        section.promptMode === "random"
          ? { ...section, pool: section.fields, fields: section.fields }
          : { ...section, pool: undefined, drawCount: undefined },
      ),
    };

    setSaving(true);
    try {
      await onSave(toSave);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save pack");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="pack-editor" onSubmit={(event) => void handleSubmit(event)}>
      <h2 className="pack-editor__title">
        {initial.id ? "Edit content pack" : "New content pack"}
      </h2>

      <label className="pack-editor__field">
        <span className="pack-editor__label">Id</span>
        <input
          className="pack-editor__input"
          value={pack.id}
          onChange={(event) => setPack({ ...pack, id: event.target.value })}
          required
          disabled={!!initial.id}
        />
      </label>

      <label className="pack-editor__field">
        <span className="pack-editor__label">Name</span>
        <input
          className="pack-editor__input"
          value={pack.name}
          onChange={(event) => setPack({ ...pack, name: event.target.value })}
          required
        />
      </label>

      <label className="pack-editor__field">
        <span className="pack-editor__label">Version</span>
        <input
          className="pack-editor__input"
          value={pack.version}
          onChange={(event) => setPack({ ...pack, version: event.target.value })}
        />
      </label>

      <label className="pack-editor__field">
        <span className="pack-editor__label">Description</span>
        <textarea
          className="pack-editor__input pack-editor__textarea"
          value={pack.description ?? ""}
          onChange={(event) =>
            setPack({
              ...pack,
              description: event.target.value || undefined,
            })
          }
          rows={2}
        />
      </label>

      <label className="pack-editor__checkbox">
        <input
          type="checkbox"
          checked={!!pack.hideFreeWrite}
          onChange={(event) =>
            setPack({ ...pack, hideFreeWrite: event.target.checked || undefined })
          }
        />
        Hide free-write section
      </label>

      {pack.sections.map((section, sectionIndex) => (
        <fieldset key={sectionIndex} className="pack-editor__fieldset">
          <legend className="pack-editor__legend">
            Section {sectionIndex + 1}
          </legend>

          <div className="pack-editor__field-card-header">
            <span className="pack-editor__field-card-title">Section controls</span>
            <div className="pack-editor__section-actions">
              <button
                type="button"
                className="packs-btn packs-btn--ghost"
                disabled={sectionIndex === 0}
                onClick={() => moveSection(sectionIndex, -1)}
              >
                Move up
              </button>
              <button
                type="button"
                className="packs-btn packs-btn--ghost"
                disabled={sectionIndex === pack.sections.length - 1}
                onClick={() => moveSection(sectionIndex, 1)}
              >
                Move down
              </button>
              {pack.sections.length > 1 && (
                <button
                  type="button"
                  className="packs-btn packs-btn--ghost"
                  onClick={() => removeSection(sectionIndex)}
                >
                  Delete section
                </button>
              )}
            </div>
          </div>

          <label className="pack-editor__field">
            <span className="pack-editor__label">Section id</span>
            <input
              className="pack-editor__input"
              value={section.id}
              onChange={(event) =>
                updateSection(sectionIndex, { id: event.target.value })
              }
            />
          </label>

          <label className="pack-editor__field">
            <span className="pack-editor__label">Section title</span>
            <input
              className="pack-editor__input"
              value={section.title}
              onChange={(event) =>
                updateSection(sectionIndex, { title: event.target.value })
              }
            />
          </label>

          <label className="pack-editor__field">
            <span className="pack-editor__label">Prompt mode</span>
            <select
              className="pack-editor__input"
              value={section.promptMode}
              onChange={(event) =>
                updateSection(sectionIndex, {
                  promptMode: event.target.value as PromptMode,
                })
              }
            >
              {PROMPT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>

          {section.promptMode === "random" && (
            <label className="pack-editor__field">
              <span className="pack-editor__label">Draw count</span>
              <input
                className="pack-editor__input"
                type="number"
                min={1}
                value={section.drawCount ?? 1}
                onChange={(event) =>
                  updateSection(sectionIndex, {
                    drawCount: Math.max(1, Number(event.target.value) || 1),
                  })
                }
              />
            </label>
          )}

          <div className="pack-editor__fields">
            <span className="pack-editor__label">Fields</span>
            {section.fields.map((field, fieldIndex) => (
              <div key={fieldIndex} className="pack-editor__field-card">
                <div className="pack-editor__field-card-header">
                  <span className="pack-editor__field-card-title">
                    Field {fieldIndex + 1}
                  </span>
                  {section.fields.length > 1 && (
                    <button
                      type="button"
                      className="packs-btn packs-btn--ghost"
                      onClick={() => removeField(sectionIndex, fieldIndex)}
                    >
                      Remove
                    </button>
                  )}
                </div>

                <label className="pack-editor__field">
                  <span className="pack-editor__label">Field id</span>
                  <input
                    className="pack-editor__input"
                    value={field.id}
                    onChange={(event) =>
                      updateField(sectionIndex, fieldIndex, {
                        id: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="pack-editor__field">
                  <span className="pack-editor__label">Label</span>
                  <input
                    className="pack-editor__input"
                    value={field.label}
                    onChange={(event) =>
                      updateField(sectionIndex, fieldIndex, {
                        label: event.target.value,
                      })
                    }
                  />
                </label>

                <label className="pack-editor__field">
                  <span className="pack-editor__label">Type</span>
                  <select
                    className="pack-editor__input"
                    value={field.type}
                    onChange={(event) =>
                      updateField(sectionIndex, fieldIndex, {
                        type: event.target.value as FieldType,
                      })
                    }
                  >
                    {FIELD_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="pack-editor__checkbox">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) =>
                      updateField(sectionIndex, fieldIndex, {
                        required: event.target.checked,
                      })
                    }
                  />
                  Required
                </label>

                {field.type !== "checklist" && (
                  <label className="pack-editor__checkbox">
                    <input
                      type="checkbox"
                      checked={!!field.stats}
                      onChange={(event) =>
                        updateField(sectionIndex, fieldIndex, {
                          stats: event.target.checked || undefined,
                        })
                      }
                    />
                    Include in stats
                  </label>
                )}

                {field.type === "number" && (
                  <label className="pack-editor__field">
                    <span className="pack-editor__label">Unit</span>
                    <input
                      className="pack-editor__input"
                      value={field.unit ?? ""}
                      onChange={(event) =>
                        updateField(sectionIndex, fieldIndex, {
                          unit: event.target.value || undefined,
                        })
                      }
                    />
                  </label>
                )}

                {field.type === "checklist" && (
                  <div className="pack-editor__checklist-options">
                    <span className="pack-editor__label">Checklist items</span>
                    {(field.options ?? []).map((option, optionIndex) => (
                      <div key={optionIndex} className="pack-editor__option-row">
                        <input
                          className="pack-editor__input"
                          placeholder="id"
                          value={option.id}
                          onChange={(event) => {
                            const options = [...(field.options ?? [])];
                            options[optionIndex] = {
                              ...option,
                              id: event.target.value,
                            };
                            updateField(sectionIndex, fieldIndex, { options });
                          }}
                        />
                        <input
                          className="pack-editor__input"
                          placeholder="label"
                          value={option.label}
                          onChange={(event) => {
                            const options = [...(field.options ?? [])];
                            options[optionIndex] = {
                              ...option,
                              label: event.target.value,
                            };
                            updateField(sectionIndex, fieldIndex, { options });
                          }}
                        />
                        <button
                          type="button"
                          className="packs-btn packs-btn--ghost"
                          onClick={() => {
                            const options = (field.options ?? []).filter(
                              (_, i) => i !== optionIndex,
                            );
                            updateField(sectionIndex, fieldIndex, { options });
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="packs-btn packs-btn--ghost"
                      onClick={() =>
                        updateField(sectionIndex, fieldIndex, {
                          options: [
                            ...(field.options ?? []),
                            { id: "", label: "" },
                          ],
                        })
                      }
                    >
                      Add item
                    </button>
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              className="packs-btn packs-btn--ghost"
              onClick={() => addField(sectionIndex)}
            >
              Add field
            </button>
          </div>
        </fieldset>
      ))}

      <button type="button" className="packs-btn packs-btn--ghost" onClick={addSection}>
        Add section
      </button>

      {error && <p className="pack-editor__error">{error}</p>}

      <div className="pack-editor__actions">
        <button type="button" className="packs-btn packs-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="packs-btn" disabled={saving}>
          {saving ? "Saving…" : "Save pack"}
        </button>
      </div>
    </form>
  );
}
