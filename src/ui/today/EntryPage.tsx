import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getOrCreateEntry, upsertEntry } from "../../db/entriesRepo";
import { listPacks } from "../../db/packsRepo";
import { getSettings, saveSettings } from "../../db/settingsRepo";
import { queueOnEditBackup } from "../../backup/onEditBackup";
import { applyStickyCompletion } from "../../domain/completion";
import { isJournalDate, todayJournalDate } from "../../domain/dates";
import { applyEntrySnapshot } from "../../domain/entrySnapshot";
import { parseFieldRef } from "../../domain/fieldRef";
import { shouldHideFreeWrite } from "../../domain/mergePacks";
import { normalizePack } from "../../domain/normalizePack";
import { redrawPromptDraw } from "../../domain/randomDraw";
import type { AnswerValue, ContentPack, DailyEntry, ProfileSettings } from "../../domain/types";
import { EntryDateNav } from "./EntryDateNav";
import { PackSection } from "./PackSection";
import { PackTabs } from "./PackTabs";

const PROFILE_ID = "local";
const AUTOSAVE_MS = 300;
const FOCUSED_PACK_SESSION_KEY = "hfl-focused-pack";

type SaveState = "idle" | "saving" | "saved";

function setAnswer(
  entry: DailyEntry,
  ref: string,
  value: AnswerValue | null,
): DailyEntry {
  const answers = entry.answers.filter((item) => item.fieldRef !== ref);
  if (value !== null) {
    answers.push({ fieldRef: ref, value });
  }
  return { ...entry, answers };
}

export function EntryPage() {
  const { date: dateParam } = useParams<{ date?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fieldParam = searchParams.get("field");
  const journalDate =
    dateParam && isJournalDate(dateParam) ? dateParam : todayJournalDate();

  const [entry, setEntry] = useState<DailyEntry | null>(null);
  const [packs, setPacks] = useState<ContentPack[]>([]);
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [focusedPackId, setFocusedPackId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(FOCUSED_PACK_SESSION_KEY);
    } catch {
      return null;
    }
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  const entryRef = useRef<DailyEntry | null>(null);
  const packsRef = useRef<ContentPack[]>([]);
  const settingsRef = useRef<ProfileSettings | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = useRef(0);
  const scrolledFieldRef = useRef<string | null>(null);

  useEffect(() => {
    entryRef.current = entry;
  }, [entry]);

  useEffect(() => {
    packsRef.current = packs;
  }, [packs]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const persistEntry = useCallback(async (draft: DailyEntry) => {
    const seq = ++saveSeqRef.current;
    setSaveState("saving");

    const activePacks = packsRef.current;
    const currentSettings = settingsRef.current;
    if (!currentSettings) {
      return;
    }

    const snapshotted = applyEntrySnapshot(draft, currentSettings, activePacks);
    const completed = applyStickyCompletion(snapshotted, activePacks, {
      requireFreeWrite: currentSettings.requireFreeWrite,
      showFreeWrite: currentSettings.showFreeWrite !== false,
      nowIso: new Date().toISOString(),
    });

    await upsertEntry(completed);

    if (seq === saveSeqRef.current) {
      setEntry(completed);
      entryRef.current = completed;
      setSaveState("saved");
      if (currentSettings?.backupOnEdit) {
        queueOnEditBackup(PROFILE_ID);
      }
    }
  }, []);

  const scheduleSave = useCallback(
    (draft: DailyEntry) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void persistEntry(draft);
      }, AUTOSAVE_MS);
    },
    [persistEntry],
  );

  const flushPendingSave = useCallback(() => {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const draft = entryRef.current;
    if (draft) {
      void persistEntry(draft);
    }
  }, [persistEntry]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadError(null);
      setEntry(null);

      try {
        const [loadedSettings, allPacks] = await Promise.all([
          getSettings(PROFILE_ID),
          listPacks(),
        ]);

        if (!loadedSettings) {
          throw new Error("Settings not found");
        }

        let loadedEntry = await getOrCreateEntry(PROFILE_ID, journalDate);
        const activePacks = loadedSettings.activeContentPackIds
          .map((id) => allPacks.find((pack) => pack.id === id))
          .filter((pack): pack is ContentPack => !!pack);

        const snapshotted = applyEntrySnapshot(loadedEntry, loadedSettings, activePacks);
        const snapshotChanged =
          snapshotted.skinId !== loadedEntry.skinId ||
          JSON.stringify(snapshotted.contentPackIds) !==
            JSON.stringify(loadedEntry.contentPackIds) ||
          JSON.stringify(snapshotted.promptDraw) !==
            JSON.stringify(loadedEntry.promptDraw);
        loadedEntry = snapshotted;

        if (snapshotChanged) {
          await upsertEntry(loadedEntry);
        }

        if (cancelled) return;

        // Keep the first pack expanded so autofocus can land on its first field.
        const hideFree = activePacks.some((pack) => pack.hideFreeWrite);
        let nextSettings = loadedSettings;
        if (hideFree && activePacks[0]) {
          const collapsed = new Set(loadedSettings.collapsedPackIds ?? []);
          if (collapsed.has(activePacks[0].id)) {
            collapsed.delete(activePacks[0].id);
            nextSettings = {
              ...loadedSettings,
              collapsedPackIds: [...collapsed],
            };
            await saveSettings(nextSettings);
          }
        }

        setSettings(nextSettings);
        setPacks(activePacks);
        setEntry(loadedEntry);
        setSaveState("saved");

        setFocusedPackId((current) => {
          if (activePacks.length === 0) return null;
          if (current && activePacks.some((pack) => pack.id === current)) {
            return current;
          }
          let fromSession: string | null = null;
          try {
            fromSession = sessionStorage.getItem(FOCUSED_PACK_SESSION_KEY);
          } catch {
            fromSession = null;
          }
          if (fromSession && activePacks.some((pack) => pack.id === fromSession)) {
            return fromSession;
          }
          return activePacks[0]?.id ?? null;
        });
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load entry");
        }
      }
    })();

    return () => {
      flushPendingSave();
      cancelled = true;
    };
  }, [journalDate, flushPendingSave]);

  useEffect(() => {
    if (!focusedPackId) return;
    try {
      sessionStorage.setItem(FOCUSED_PACK_SESSION_KEY, focusedPackId);
    } catch {
      // ignore quota / private mode
    }
  }, [focusedPackId]);

  useEffect(() => {
    scrolledFieldRef.current = null;
  }, [journalDate, fieldParam]);

  useEffect(() => {
    if (!fieldParam || !entry || !settings || scrolledFieldRef.current === fieldParam) {
      return;
    }

    let packId: string;
    try {
      packId = parseFieldRef(fieldParam).packId;
    } catch {
      return;
    }

    const collapsed = new Set(settings.collapsedPackIds ?? []);
    if (collapsed.has(packId)) {
      collapsed.delete(packId);
      const nextSettings: ProfileSettings = {
        ...settings,
        collapsedPackIds: [...collapsed],
      };
      setSettings(nextSettings);
      void saveSettings(nextSettings);
    }

    setFocusedPackId(packId);

    const timer = window.setTimeout(() => {
      const el = document.getElementById(`field-${fieldParam}`);
      if (el) {
        el.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        const focusable = el.querySelector<HTMLElement>(
          "textarea, input, button.yes-no-btn",
        );
        focusable?.focus();
        scrolledFieldRef.current = fieldParam;
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [entry, fieldParam, settings]);

  useEffect(() => {
    return () => {
      flushPendingSave();
    };
  }, [flushPendingSave]);

  const updateEntry = (updater: (current: DailyEntry) => DailyEntry) => {
    setEntry((current) => {
      if (!current) return current;
      const next = updater(current);
      setSaveState("idle");
      scheduleSave(next);
      return next;
    });
  };

  const togglePackCollapse = (packId: string) => {
    if (!settings) return;

    const collapsed = new Set(settings.collapsedPackIds ?? []);
    if (collapsed.has(packId)) {
      collapsed.delete(packId);
    } else {
      collapsed.add(packId);
    }

    const nextSettings: ProfileSettings = {
      ...settings,
      collapsedPackIds: [...collapsed],
    };

    setSettings(nextSettings);
    void saveSettings(nextSettings);
  };

  const selectPackTab = (packId: string) => {
    setFocusedPackId(packId);

    if (settings && settings.multiPackShowOneAtATime !== false) {
      // Ensure the focused pack is expanded when filtering to one.
      if (settings.collapsedPackIds?.includes(packId)) {
        const collapsed = new Set(settings.collapsedPackIds);
        collapsed.delete(packId);
        const nextSettings: ProfileSettings = {
          ...settings,
          collapsedPackIds: [...collapsed],
        };
        setSettings(nextSettings);
        void saveSettings(nextSettings);
      }
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(`pack-${packId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const handleRedraw = (pack: ContentPack, sectionId: string) => {
    updateEntry((current) => redrawPromptDraw(current, pack, sectionId));
  };

  const handleManualSave = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const draft = entryRef.current;
    if (draft) {
      void persistEntry(draft);
    }
  };

  const handleDateChange = (nextDate: string) => {
    if (!isJournalDate(nextDate)) return;
    if (nextDate === todayJournalDate()) {
      navigate("/");
    } else {
      navigate(`/entry/${nextDate}`);
    }
  };

  if (loadError) {
    return (
      <div className="entry-page">
        <p className="entry-error">{loadError}</p>
      </div>
    );
  }

  if (!entry || !settings) {
    return (
      <div className="entry-page">
        <p className="entry-loading">Loading entry…</p>
      </div>
    );
  }

  const hideFreeWrite =
    settings.showFreeWrite === false || shouldHideFreeWrite(packs);
  const collapsedIds = new Set(settings.collapsedPackIds ?? []);
  const showOneAtATime =
    settings.multiPackShowOneAtATime !== false && packs.length > 1;
  const visiblePacks =
    showOneAtATime && focusedPackId
      ? packs.filter((pack) => pack.id === focusedPackId)
      : packs;
  const saveLabel =
    saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "";
  const saveButtonLabel =
    saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save";
  const autofocusFirst = !fieldParam;
  const firstPackIdForFocus = autofocusFirst
    ? visiblePacks.find((pack) => !collapsedIds.has(pack.id))?.id
    : undefined;

  return (
    <div className="entry-page">
      <header className="entry-header">
        <div className="entry-header__row">
          <EntryDateNav
            journalDate={journalDate}
            dateFormat={settings.entryDateFormat ?? "full"}
            onChangeDate={handleDateChange}
          />
        </div>
        <PackTabs
          packs={packs}
          focusedPackId={focusedPackId}
          onSelect={selectPackTab}
        />
      </header>

      {visiblePacks.map((pack) => (
        <PackSection
          key={pack.id}
          pack={pack}
          entry={entry}
          collapsed={collapsedIds.has(pack.id)}
          autoFocusFirst={pack.id === firstPackIdForFocus}
          focusFieldRef={fieldParam}
          onToggleCollapse={() => togglePackCollapse(pack.id)}
          onAnswerChange={(ref, value) => {
            updateEntry((current) => setAnswer(current, ref, value));
          }}
          onRedrawPrompt={
            normalizePack(pack).sections.some((s) => s.promptMode === "random")
              ? (sectionId) => handleRedraw(pack, sectionId)
              : undefined
          }
        />
      ))}

      {!hideFreeWrite && (
        <section className="free-write">
          <label className="field">
            <span className="field-label">Free write</span>
            <textarea
              className="field-input field-input--textarea field-input--free-write"
              value={entry.body}
              rows={6}
              autoFocus={autofocusFirst && visiblePacks.length === 0}
              onChange={(event) => {
                updateEntry((current) => ({ ...current, body: event.target.value }));
              }}
            />
          </label>
        </section>
      )}

      <div className="entry-actions">
        <button
          type="button"
          className="entry-save-button"
          onClick={handleManualSave}
          disabled={saveState === "saving"}
        >
          {saveButtonLabel}
        </button>
        <p className="entry-save-state" aria-live="polite">
          {saveLabel || "\u00a0"}
        </p>
        <p className="entry-save-hint">Autosaves as you type — tap Save when you’re done.</p>
      </div>
    </div>
  );
}
