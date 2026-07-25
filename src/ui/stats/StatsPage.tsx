import { useEffect, useMemo, useRef, useState } from "react";
import { listEntriesForProfile } from "../../db/entriesRepo";
import { getSettings, saveSettings } from "../../db/settingsRepo";
import { listPacks } from "../../db/packsRepo";
import { addJournalDays, todayJournalDate } from "../../domain/dates";
import { fieldRef } from "../../domain/fieldRef";
import {
  streakMilestoneMessage,
  streakMilestoneToToast,
  updatedLastToastedStreakMilestone,
} from "../../domain/milestones";
import {
  aggregateNumberField,
  aggregateYesNoField,
  countLongTextField,
} from "../../domain/stats";
import {
  computeOverallStreak,
  computePackStreak,
  computePreferredAnswerStreak,
  countDaysJournaled,
} from "../../domain/streaks";
import { allPackFields } from "../../domain/normalizePack";
import type { ContentPack, DailyEntry, PackField, ProfileSettings } from "../../domain/types";

const PROFILE_ID = "local";

export type StatsRange = "7" | "30" | "90" | "year" | "all";

const RANGE_OPTIONS: { value: StatsRange; label: string }[] = [
  { value: "7", label: "7d" },
  { value: "30", label: "30d" },
  { value: "90", label: "90d" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
];

function rangeStartDate(range: StatsRange, asOf: string): string | null {
  if (range === "all") return null;
  if (range === "year") return `${asOf.slice(0, 4)}-01-01`;
  const offset = range === "7" ? 6 : range === "30" ? 29 : 89;
  return addJournalDays(asOf, -offset);
}

function filterEntriesByRange(
  entries: DailyEntry[],
  range: StatsRange,
  asOf: string,
): DailyEntry[] {
  const start = rangeStartDate(range, asOf);
  if (!start) return entries;
  return entries.filter((entry) => entry.date >= start && entry.date <= asOf);
}

function fieldShowsStats(field: PackField): boolean {
  return field.stats !== false;
}

function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function NumberFieldStatsView({
  entries,
  packId,
  field,
}: {
  entries: DailyEntry[];
  packId: string;
  field: PackField;
}) {
  const ref = fieldRef(packId, field.id);
  const stats = aggregateNumberField(entries, ref);
  if (stats.count === 0) return null;

  const unit = field.unit ? ` ${field.unit}` : "";

  return (
    <div className="stats-field">
      <h4 className="stats-field__label">{field.label}</h4>
      <dl className="stats-field__grid">
        <div>
          <dt>Count</dt>
          <dd>{stats.count}</dd>
        </div>
        <div>
          <dt>Avg</dt>
          <dd>
            {stats.avg.toFixed(1)}
            {unit}
          </dd>
        </div>
        <div>
          <dt>Min</dt>
          <dd>
            {stats.min}
            {unit}
          </dd>
        </div>
        <div>
          <dt>Max</dt>
          <dd>
            {stats.max}
            {unit}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function YesNoFieldStatsView({
  allEntries,
  rangeEntries,
  packId,
  field,
  asOf,
}: {
  allEntries: DailyEntry[];
  rangeEntries: DailyEntry[];
  packId: string;
  field: PackField;
  asOf: string;
}) {
  const ref = fieldRef(packId, field.id);
  const stats = aggregateYesNoField(rangeEntries, ref);
  const answered = stats.yesCount + stats.noCount;
  if (answered === 0 && !field.preferredAnswer) return null;

  const preferredStreak =
    field.preferredAnswer &&
    computePreferredAnswerStreak(allEntries, ref, field.preferredAnswer, asOf);

  return (
    <div className="stats-field">
      <h4 className="stats-field__label">{field.label}</h4>
      {field.preferredAnswer && preferredStreak ? (
        <p className="stats-field__highlight">
          {field.preferredAnswer === "yes" ? "Yes" : "No"} streak: {preferredStreak.current}{" "}
          (best {preferredStreak.longest})
        </p>
      ) : null}
      {answered > 0 ? (
        <dl className="stats-field__grid">
          <div>
            <dt>Yes</dt>
            <dd>
              {stats.yesCount} ({formatRate(stats.yesRate)})
            </dd>
          </div>
          <div>
            <dt>No</dt>
            <dd>
              {stats.noCount} ({formatRate(stats.noRate)})
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

function LongTextFieldStatsView({
  entries,
  packId,
  field,
}: {
  entries: DailyEntry[];
  packId: string;
  field: PackField;
}) {
  const ref = fieldRef(packId, field.id);
  const count = countLongTextField(entries, ref);
  if (count === 0) return null;

  return (
    <div className="stats-field">
      <h4 className="stats-field__label">{field.label}</h4>
      <p className="stats-field__count">{count} days answered</p>
    </div>
  );
}

function PackStatsSection({
  pack,
  allEntries,
  rangeEntries,
  settings,
  asOf,
}: {
  pack: ContentPack;
  allEntries: DailyEntry[];
  rangeEntries: DailyEntry[];
  settings: ProfileSettings;
  asOf: string;
}) {
  const packStreak = computePackStreak(allEntries, pack.id, {
    asOf,
    backdateRepairsStreak: settings.backdateRepairsStreak,
  });

  const statFields = allPackFields(pack).filter(fieldShowsStats);

  return (
    <section className="stats-pack">
      <header className="stats-pack__header">
        <h2 className="stats-pack__title">{pack.name}</h2>
        <p className="stats-pack__streak">
          Streak {packStreak.current} · Best {packStreak.longest}
        </p>
      </header>
      {statFields.length === 0 ? (
        <p className="stats-muted">No trackable fields in this pack.</p>
      ) : (
        <div className="stats-pack__fields">
          {statFields.map((field) => {
            if (field.type === "number") {
              return (
                <NumberFieldStatsView
                  key={field.id}
                  entries={rangeEntries}
                  packId={pack.id}
                  field={field}
                />
              );
            }
            if (field.type === "yesNo") {
              return (
                <YesNoFieldStatsView
                  key={field.id}
                  allEntries={allEntries}
                  rangeEntries={rangeEntries}
                  packId={pack.id}
                  field={field}
                  asOf={asOf}
                />
              );
            }
            return (
              <LongTextFieldStatsView
                key={field.id}
                entries={rangeEntries}
                packId={pack.id}
                field={field}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function StatsPage() {
  const asOf = todayJournalDate();
  const [range, setRange] = useState<StatsRange>("30");
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [packs, setPacks] = useState<ContentPack[]>([]);
  const [allEntries, setAllEntries] = useState<DailyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const milestoneChecked = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const [loadedSettings, loadedPacks, loadedEntries] = await Promise.all([
          getSettings(PROFILE_ID),
          listPacks(),
          listEntriesForProfile(PROFILE_ID),
        ]);

        if (!loadedSettings) {
          throw new Error("Settings not found");
        }

        if (!cancelled) {
          setSettings(loadedSettings);
          setPacks(loadedPacks);
          setAllEntries(loadedEntries);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load stats");
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

  const activePacks = useMemo(() => {
    if (!settings) return [];
    const byId = new Map(packs.map((pack) => [pack.id, pack]));
    return settings.activeContentPackIds
      .map((id) => byId.get(id))
      .filter((pack): pack is ContentPack => !!pack);
  }, [packs, settings]);

  const rangeEntries = useMemo(
    () => filterEntriesByRange(allEntries, range, asOf),
    [allEntries, range, asOf],
  );

  const overallStreak = useMemo(() => {
    if (!settings) return { current: 0, longest: 0 };
    return computeOverallStreak(allEntries, {
      asOf,
      backdateRepairsStreak: settings.backdateRepairsStreak,
    });
  }, [allEntries, asOf, settings]);

  const daysJournaled = useMemo(() => countDaysJournaled(rangeEntries), [rangeEntries]);

  useEffect(() => {
    if (!settings || loading || milestoneChecked.current) return;

    milestoneChecked.current = true;

    if (overallStreak.current === 0 && settings.lastToastedStreakMilestone !== undefined) {
      const cleared = { ...settings, lastToastedStreakMilestone: undefined };
      setSettings(cleared);
      void saveSettings(cleared);
      return;
    }

    const milestone = streakMilestoneToToast(
      overallStreak.current,
      settings.lastToastedStreakMilestone,
    );
    if (!milestone) return;

    setToast(streakMilestoneMessage(milestone));

    const updated: ProfileSettings = {
      ...settings,
      lastToastedStreakMilestone: updatedLastToastedStreakMilestone(
        overallStreak.current,
        settings.lastToastedStreakMilestone,
        milestone,
      ),
    };

    setSettings(updated);
    void saveSettings(updated);

    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [loading, overallStreak.current, settings]);

  if (loadError) {
    return <p className="stats-error">{loadError}</p>;
  }

  if (loading || !settings) {
    return <p className="stats-loading">Loading stats…</p>;
  }

  return (
    <div className="stats-page">
      {toast ? (
        <div className="stats-toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}

      <header className="stats-header">
        <h1 className="stats-title">Stats</h1>
        <div className="stats-range" role="group" aria-label="Date range">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={
                range === option.value
                  ? "stats-range__chip stats-range__chip--active"
                  : "stats-range__chip"
              }
              aria-pressed={range === option.value}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <section className="stats-overall" aria-label="Overall stats">
        <h2 className="stats-overall__title">Overall</h2>
        <dl className="stats-overall__grid">
          <div>
            <dt>Days journaled</dt>
            <dd>{daysJournaled}</dd>
          </div>
          <div>
            <dt>Current streak</dt>
            <dd>{overallStreak.current}</dd>
          </div>
          <div>
            <dt>Longest streak</dt>
            <dd>{overallStreak.longest}</dd>
          </div>
        </dl>
      </section>

      {activePacks.length === 0 ? (
        <p className="stats-muted">No active content packs.</p>
      ) : (
        activePacks.map((pack) => (
          <PackStatsSection
            key={pack.id}
            pack={pack}
            allEntries={allEntries}
            rangeEntries={rangeEntries}
            settings={settings}
            asOf={asOf}
          />
        ))
      )}
    </div>
  );
}
