import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { listEntriesForProfile } from "../../db/entriesRepo";
import { listPacks } from "../../db/packsRepo";
import {
  searchEntries,
  type SearchCompletionFilter,
  type SearchResult,
} from "../../db/searchIndex";
import {
  buildEntryAnswerLines,
  formatEntryTableDate,
} from "../../domain/entryTableRows";
import { fieldRef } from "../../domain/fieldRef";
import { allPackFields } from "../../domain/normalizePack";
import type { ContentPack, DailyEntry, PackField } from "../../domain/types";

const PROFILE_ID = "local";

interface FieldOption {
  ref: string;
  label: string;
  type: PackField["type"];
}

function collectFieldOptions(packs: ContentPack[]): FieldOption[] {
  const options: FieldOption[] = [];
  for (const pack of packs) {
    for (const field of allPackFields(pack)) {
      if (field.type === "yesNo" || field.type === "number") {
        options.push({
          ref: fieldRef(pack.id, field.id),
          label: `${pack.name} · ${field.label}`,
          type: field.type,
        });
      }
    }
  }
  return options;
}

function entryLink(result: SearchResult): string {
  const params = result.fieldRef
    ? `?field=${encodeURIComponent(result.fieldRef)}`
    : "";
  return `/entry/${result.date}${params}`;
}

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [packId, setPackId] = useState("");
  const [completion, setCompletion] = useState<SearchCompletionFilter>("all");
  const [yesNoFieldRef, setYesNoFieldRef] = useState("");
  const [yesNoValue, setYesNoValue] = useState<"" | "yes" | "no">("");
  const [numberFieldRef, setNumberFieldRef] = useState("");
  const [numberMin, setNumberMin] = useState("");
  const [numberMax, setNumberMax] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fontScale, setFontScale] = useState(1);

  const [packs, setPacks] = useState<ContentPack[]>([]);
  const [entriesById, setEntriesById] = useState<Map<string, DailyEntry>>(
    () => new Map(),
  );
  const [results, setResults] = useState<SearchResult[]>([]);
  const [entryCount, setEntryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [loadedPacks, loadedEntries] = await Promise.all([
          listPacks(),
          listEntriesForProfile(PROFILE_ID),
        ]);
        if (cancelled) return;
        setPacks(loadedPacks);
        setEntriesById(new Map(loadedEntries.map((entry) => [entry.id, entry])));
        setEntryCount(loadedEntries.length);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Failed to load entries",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const yesNoFields = useMemo(
    () => collectFieldOptions(packs).filter((option) => option.type === "yesNo"),
    [packs],
  );
  const numberFields = useMemo(
    () => collectFieldOptions(packs).filter((option) => option.type === "number"),
    [packs],
  );

  useEffect(() => {
    if (loading) return;

    let cancelled = false;

    void (async () => {
      setSearching(true);
      setLoadError(null);
      try {
        const parsedMin = numberMin.trim() === "" ? undefined : Number(numberMin);
        const parsedMax = numberMax.trim() === "" ? undefined : Number(numberMax);

        const nextResults = await searchEntries(PROFILE_ID, {
          query,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          packId: packId || undefined,
          completion,
          yesNoFieldRef: yesNoFieldRef || undefined,
          yesNoValue:
            yesNoFieldRef && yesNoValue === "yes"
              ? true
              : yesNoFieldRef && yesNoValue === "no"
                ? false
                : undefined,
          numberFieldRef: numberFieldRef || undefined,
          numberMin:
            parsedMin !== undefined && !Number.isNaN(parsedMin)
              ? parsedMin
              : undefined,
          numberMax:
            parsedMax !== undefined && !Number.isNaN(parsedMax)
              ? parsedMax
              : undefined,
        });

        if (!cancelled) {
          setResults(nextResults);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Search failed");
        }
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    loading,
    query,
    dateFrom,
    dateTo,
    packId,
    completion,
    yesNoFieldRef,
    yesNoValue,
    numberFieldRef,
    numberMin,
    numberMax,
  ]);

  if (loading) {
    return <p className="search-loading">Loading entries…</p>;
  }

  const emptyMessage =
    entryCount === 0 ? "No entries yet." : "No matches.";

  return (
    <div className="search-page">
      <header className="search-header">
        <h1 className="search-title">View &amp; search entries</h1>
      </header>

      <div className="search-toolbar">
        <label className="search-field search-field--keyword">
          <span className="search-field__label">Keyword</span>
          <input
            className="search-field__input"
            type="search"
            value={query}
            placeholder="Search body and answers"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="search-pack-buttons" role="group" aria-label="Pack filter">
          <button
            type="button"
            className={
              packId === ""
                ? "search-chip search-chip--active"
                : "search-chip"
            }
            aria-pressed={packId === ""}
            onClick={() => setPackId("")}
          >
            All
          </button>
          {packs.map((pack) => (
            <button
              key={pack.id}
              type="button"
              className={
                packId === pack.id
                  ? "search-chip search-chip--active"
                  : "search-chip"
              }
              aria-pressed={packId === pack.id}
              onClick={() => setPackId(pack.id)}
            >
              {pack.name}
            </button>
          ))}
        </div>

        <div className="search-advanced-row">
          <details
            className="search-advanced"
            open={advancedOpen}
            onToggle={(event) =>
              setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)
            }
          >
            <summary className="search-advanced__summary">Advanced filters</summary>
            <div className="search-advanced__body">
              <div className="search-field-row">
                <label className="search-field">
                  <span className="search-field__label">From</span>
                  <input
                    className="search-field__input"
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                  />
                </label>
                <label className="search-field">
                  <span className="search-field__label">To</span>
                  <input
                    className="search-field__input"
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                  />
                </label>
              </div>

              <fieldset className="search-field search-field--inline">
                <legend className="search-field__label">Completion</legend>
                <div className="search-chip-group">
                  {(
                    [
                      ["all", "All"],
                      ["completed", "Completed"],
                      ["draft", "Draft"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={
                        completion === value
                          ? "search-chip search-chip--active"
                          : "search-chip"
                      }
                      aria-pressed={completion === value}
                      onClick={() => setCompletion(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {yesNoFields.length > 0 ? (
                <div className="search-field-row">
                  <label className="search-field">
                    <span className="search-field__label">Yes/No field</span>
                    <select
                      className="search-field__input"
                      value={yesNoFieldRef}
                      onChange={(event) => {
                        setYesNoFieldRef(event.target.value);
                        if (!event.target.value) setYesNoValue("");
                      }}
                    >
                      <option value="">Any</option>
                      {yesNoFields.map((option) => (
                        <option key={option.ref} value={option.ref}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="search-field">
                    <span className="search-field__label">Value</span>
                    <select
                      className="search-field__input"
                      value={yesNoValue}
                      disabled={!yesNoFieldRef}
                      onChange={(event) =>
                        setYesNoValue(event.target.value as "" | "yes" | "no")
                      }
                    >
                      <option value="">Any</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {numberFields.length > 0 ? (
                <>
                  <label className="search-field">
                    <span className="search-field__label">Number field</span>
                    <select
                      className="search-field__input"
                      value={numberFieldRef}
                      onChange={(event) => setNumberFieldRef(event.target.value)}
                    >
                      <option value="">Any</option>
                      {numberFields.map((option) => (
                        <option key={option.ref} value={option.ref}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="search-field-row">
                    <label className="search-field">
                      <span className="search-field__label">Min</span>
                      <input
                        className="search-field__input"
                        type="number"
                        value={numberMin}
                        disabled={!numberFieldRef}
                        onChange={(event) => setNumberMin(event.target.value)}
                      />
                    </label>
                    <label className="search-field">
                      <span className="search-field__label">Max</span>
                      <input
                        className="search-field__input"
                        type="number"
                        value={numberMax}
                        disabled={!numberFieldRef}
                        onChange={(event) => setNumberMax(event.target.value)}
                      />
                    </label>
                  </div>
                </>
              ) : null}
            </div>
          </details>

          <div className="entries-font-controls" role="group" aria-label="Font size">
            <button
              type="button"
              className="entries-font-controls__btn"
              aria-label="Decrease font size"
              disabled={fontScale <= 0.85}
              onClick={() => setFontScale((scale) => Math.max(0.85, scale - 0.1))}
            >
              A−
            </button>
            <button
              type="button"
              className="entries-font-controls__btn"
              aria-label="Increase font size"
              disabled={fontScale >= 1.35}
              onClick={() => setFontScale((scale) => Math.min(1.35, scale + 0.1))}
            >
              A+
            </button>
          </div>
        </div>
      </div>

      {loadError ? <p className="search-error">{loadError}</p> : null}

      <section
        className="entries-table-section pack-section"
        aria-live="polite"
        style={{ "--entries-font-scale": String(fontScale) } as CSSProperties}
      >
        <p className="entries-table-meta">
          {searching
            ? "Updating…"
            : `${results.length} entr${results.length === 1 ? "y" : "ies"}`}
        </p>

        {results.length === 0 ? (
          <p className="search-muted">{emptyMessage}</p>
        ) : (
          <div className="entries-table-panel">
            <table className="entries-table">
              <thead className="visually-hidden">
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Answers</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => {
                  const entry = entriesById.get(result.id);
                  const lines = entry
                    ? buildEntryAnswerLines(entry, packs, {
                        packId: packId || undefined,
                      })
                    : [{ label: "Preview", value: result.snippet }];

                  return (
                    <tr key={result.id} className="entries-table__row">
                      <th scope="row" className="entries-table__date">
                        <Link
                          className="entries-table__link"
                          to={entryLink(result)}
                        >
                          {formatEntryTableDate(result.date)}
                        </Link>
                      </th>
                      <td className="entries-table__answers">
                        <Link
                          className="entries-table__link"
                          to={entryLink(result)}
                        >
                          {lines.length === 0 ? (
                            <span className="entries-table__empty-answers">
                              (no answers)
                            </span>
                          ) : (
                            <ul className="entries-table__lines">
                              {lines.map((line) => (
                                <li
                                  key={`${result.id}:${line.fieldRef ?? line.label}`}
                                  className="entries-table__line"
                                >
                                  <span className="entries-table__label">
                                    {line.label}
                                  </span>
                                  <span className="entries-table__value">
                                    {line.value}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
