import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  clearBackupFolderHandle,
  getStoredBackupFolderHandle,
  pickAndStoreBackupFolder,
  supportsFileSystemAccess,
} from "../../backup/backupFolder";
import { subscribeBackupNotice, clearBackupNotice } from "../../backup/backupNotice";
import { isEncryptedEnvelope } from "../../backup/crypto";
import { downloadBlob, vaultZipFilename } from "../../backup/download";
import { exportJsonBackup, jsonBackupFilename } from "../../backup/jsonExport";
import { importJsonBackup } from "../../backup/jsonImport";
import { runBackup } from "../../backup/schedule";
import { exportVaultZip } from "../../backup/vaultExport";
import {
  importVaultZip,
  previewVaultImport,
  type VaultImportPreview,
} from "../../backup/vaultImport";
import { getSettings, saveSettings } from "../../db/settingsRepo";
import { db } from "../../db/database";
import { ensureSeeded } from "../../db/seed";
import { listSkins } from "../../db/skinsRepo";
import type { ProfileSettings } from "../../domain/types";
import { HFL_SKIN } from "../../packs/hflBuiltIn";
import { applySkin } from "../skin/applySkin";

const PROFILE_ID = "local";

const CADENCE_OPTIONS: { value: ProfileSettings["backupCadence"]; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

function formatLastBackup(iso: string | undefined): string {
  if (!iso) {
    return "Never";
  }
  return new Date(iso).toLocaleString();
}

function isVaultImportFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".zip") || file.type.includes("zip");
}

export function MorePage() {
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [hasBackupFolder, setHasBackupFolder] = useState(false);
  const [dataBusy, setDataBusy] = useState(false);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [vaultPreview, setVaultPreview] = useState<VaultImportPreview | null>(null);
  const [vaultImportData, setVaultImportData] = useState<ArrayBuffer | null>(null);
  const [forceOverwriteConflicts, setForceOverwriteConflicts] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const loaded = await getSettings(PROFILE_ID);
    if (!loaded) {
      throw new Error("Settings not found");
    }
    setSettings(loaded);
    const folder = await getStoredBackupFolderHandle(PROFILE_ID);
    setHasBackupFolder(!!folder);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        await reload();
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load settings");
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
  }, [reload]);

  useEffect(() => subscribeBackupNotice(setBackupMessage), []);

  const persistSettings = async (next: ProfileSettings) => {
    await saveSettings(next);
    setSettings(next);
  };

  const handleDeleteAllData = async () => {
    const confirmed = window.confirm(
      "Delete ALL journal data on this device? Entries, packs, skins, settings, and backups folder links will be erased. Built-in packs and skins will be restored.",
    );
    if (!confirmed) return;
    const confirmedAgain = window.confirm(
      "This cannot be undone. Type-confirm: delete everything?",
    );
    if (!confirmedAgain) return;

    setDataBusy(true);
    setDataMessage(null);
    try {
      await db.delete();
      await db.open();
      await ensureSeeded(PROFILE_ID);
      const skins = await listSkins();
      const settingsAfter = await getSettings(PROFILE_ID);
      const skin =
        skins.find((item) => item.id === settingsAfter?.activeSkinId) ?? HFL_SKIN;
      applySkin(skin);
      await reload();
      setDataMessage("All data deleted. Built-ins restored.");
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : "Delete failed");
    } finally {
      setDataBusy(false);
    }
  };

  const handleBackupNow = async () => {
    setBackupBusy(true);
    setBackupMessage(null);
    try {
      const delivery = await runBackup(PROFILE_ID, { allowDownloadFallback: true });
      await reload();
      if (!delivery.ok) {
        setBackupMessage("Backup could not be saved. Try again or choose a backup folder.");
        return;
      }
      clearBackupNotice();
      setBackupMessage("Backup saved.");
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Backup failed");
    } finally {
      setBackupBusy(false);
    }
  };

  const handlePickFolder = async () => {
    try {
      const picked = await pickAndStoreBackupFolder(PROFILE_ID);
      if (picked) {
        setHasBackupFolder(true);
        setBackupMessage("Backup folder saved for this browser.");
      }
    } catch (error) {
      setBackupMessage(error instanceof Error ? error.message : "Could not choose folder");
    }
  };

  const handleClearFolder = async () => {
    await clearBackupFolderHandle(PROFILE_ID);
    setHasBackupFolder(false);
    setBackupMessage("Backup folder cleared.");
  };

  const handleExportVault = async () => {
    setDataBusy(true);
    setDataMessage(null);
    try {
      const blob = await exportVaultZip({ profileId: PROFILE_ID });
      downloadBlob(blob, vaultZipFilename());
      setDataMessage("Vault exported.");
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : "Vault export failed");
    } finally {
      setDataBusy(false);
    }
  };

  const handleExportJson = async () => {
    const passphrase = window.prompt(
      "Optional passphrase — leave empty for unencrypted JSON, or Cancel to abort:",
    );
    if (passphrase === null) {
      return;
    }

    setDataBusy(true);
    setDataMessage(null);
    try {
      const json = await exportJsonBackup({
        profileId: PROFILE_ID,
        passphrase: passphrase.trim() || undefined,
      });
      const encrypted = passphrase.trim().length > 0;
      const blob = new Blob([json], { type: "application/json" });
      downloadBlob(blob, jsonBackupFilename(encrypted));
      setDataMessage(encrypted ? "Encrypted JSON exported." : "JSON exported.");
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : "JSON export failed");
    } finally {
      setDataBusy(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setDataBusy(true);
    setDataMessage(null);
    setVaultPreview(null);
    setVaultImportData(null);
    try {
      if (isVaultImportFile(file)) {
        const data = await file.arrayBuffer();
        const preview = await previewVaultImport(data, PROFILE_ID);
        setVaultImportData(data);
        setVaultPreview(preview);
        setForceOverwriteConflicts(false);
        return;
      }

      const raw = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        setDataMessage("Invalid JSON backup file.");
        return;
      }

      let passphrase: string | undefined;
      if (isEncryptedEnvelope(parsed)) {
        const entered = window.prompt("Enter passphrase for encrypted backup:");
        if (!entered) {
          setDataMessage("Import cancelled.");
          return;
        }
        passphrase = entered;
      }

      const result = await importJsonBackup(raw, {
        profileId: PROFILE_ID,
        passphrase,
      });
      await reload();
      const parts = [
        `${result.entriesImported} entries imported`,
        `${result.packsImported} packs`,
        `${result.skinsImported} skins`,
      ];
      if (result.entriesSkipped > 0) {
        parts.push(`${result.entriesSkipped} entries skipped`);
      }
      if (result.settingsImported) {
        parts.push("settings restored");
      }
      setDataMessage(parts.join("; ") + ".");
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : "Import failed");
    } finally {
      setDataBusy(false);
    }
  };

  const cancelVaultImport = () => {
    setVaultPreview(null);
    setVaultImportData(null);
    setForceOverwriteConflicts(false);
    setDataBusy(false);
  };

  const confirmVaultImport = async () => {
    if (!vaultImportData || !vaultPreview) {
      return;
    }

    setDataBusy(true);
    setDataMessage(null);
    try {
      const result = await importVaultZip(vaultImportData, {
        profileId: PROFILE_ID,
        forceOverwrite: forceOverwriteConflicts
          ? vaultPreview.conflicts.map((conflict) => conflict.date)
          : undefined,
      });
      await reload();
      const parts = [`${result.imported} entries imported`];
      if (result.skipped > 0) {
        parts.push(`${result.skipped} skipped (newer local copy)`);
      }
      if (result.rejected > 0) {
        parts.push(`${result.rejected} files rejected`);
      }
      setDataMessage(parts.join("; ") + ".");
      setVaultPreview(null);
      setVaultImportData(null);
      setForceOverwriteConflicts(false);
    } catch (error) {
      setDataMessage(error instanceof Error ? error.message : "Vault import failed");
    } finally {
      setDataBusy(false);
    }
  };

  const handleImportChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    void handleImportFile(file);
  };

  if (loadError) {
    return <p className="more-error">{loadError}</p>;
  }

  if (loading || !settings) {
    return <p className="more-loading">Loading settings…</p>;
  }

  return (
    <div className="more-page">
      <header className="more-header">
        <h1 className="more-title">More</h1>
      </header>

      <section className="more-section" aria-labelledby="journal-settings-heading">
        <h2 id="journal-settings-heading" className="more-section__title">
          Journal
        </h2>

        <label className="more-toggle">
          <input
            type="checkbox"
            checked={settings.backdateRepairsStreak}
            onChange={(event) => {
              void persistSettings({
                ...settings,
                backdateRepairsStreak: event.target.checked,
              });
            }}
          />
          <span>Backdated entries count toward streak repair</span>
        </label>

        <label className="more-toggle">
          <input
            type="checkbox"
            checked={settings.showFreeWrite !== false}
            onChange={(event) => {
              void persistSettings({
                ...settings,
                showFreeWrite: event.target.checked,
              });
            }}
          />
          <span>Show free-write box</span>
        </label>

        <label className="more-toggle">
          <input
            type="checkbox"
            checked={settings.requireFreeWrite}
            onChange={(event) => {
              void persistSettings({
                ...settings,
                requireFreeWrite: event.target.checked,
              });
            }}
          />
          <span>Require free write for overall completion</span>
        </label>

        <label className="more-toggle">
          <input
            type="checkbox"
            checked={settings.multiPackShowOneAtATime !== false}
            onChange={(event) => {
              void persistSettings({
                ...settings,
                multiPackShowOneAtATime: event.target.checked,
              });
            }}
          />
          <span>Multi-pack tabs: show one pack at a time</span>
        </label>

        <label className="more-field">
          <span className="more-field__label">Entry date format</span>
          <select
            className="more-field__input"
            value={settings.entryDateFormat ?? "full"}
            onChange={(event) => {
              void persistSettings({
                ...settings,
                entryDateFormat: event.target.value as ProfileSettings["entryDateFormat"],
              });
            }}
          >
            <option value="full">Monday, 23 July 2026</option>
            <option value="short">Monday, 23 Jul 2026</option>
            <option value="numeric">Monday, 23 07 2026</option>
          </select>
        </label>

        <p className="more-help">
          Streak repair applies when you complete an entry for a past journal date. Free-write
          is ignored when hidden by an active pack. Pack tabs scroll by default; turn on
          “show one pack at a time” to hide the others until you switch. Themes can style the
          entry date via <code>--skin-entry-date-size</code>,{" "}
          <code>--skin-entry-date-weight</code>, and <code>--skin-entry-date-family</code>.
        </p>
      </section>

      <section className="more-section" aria-labelledby="backup-settings-heading">
        <h2 id="backup-settings-heading" className="more-section__title">
          Backup
        </h2>

        <label className="more-field">
          <span className="more-field__label">Cadence</span>
          <select
            className="more-field__input"
            value={settings.backupCadence}
            onChange={(event) => {
              void persistSettings({
                ...settings,
                backupCadence: event.target.value as ProfileSettings["backupCadence"],
              });
            }}
          >
            {CADENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="more-field">
          <span className="more-field__label">Backup time</span>
          <input
            className="more-field__input"
            type="time"
            value={settings.backupTimeLocal}
            onChange={(event) => {
              void persistSettings({
                ...settings,
                backupTimeLocal: event.target.value,
              });
            }}
          />
        </label>

        <label className="more-toggle">
          <input
            type="checkbox"
            checked={settings.backupOnEdit}
            onChange={(event) => {
              void persistSettings({
                ...settings,
                backupOnEdit: event.target.checked,
              });
            }}
          />
          <span>Backup after edits (5s debounce)</span>
        </label>

        <p className="more-help">
          Scheduled backups run when you open the app after your chosen time, if the last
          backup is older than the cadence. On phones and PWAs, the OS may suspend the app in
          the background, so backups are best-effort and use download or share instead of a
          fixed folder.
        </p>

        <p className="more-meta">Last backup: {formatLastBackup(settings.lastBackupAt)}</p>

        <div className="more-actions">
          <button
            type="button"
            className="more-button"
            disabled={backupBusy}
            onClick={() => void handleBackupNow()}
          >
            {backupBusy ? "Backing up…" : "Backup now"}
          </button>
        </div>

        {supportsFileSystemAccess() ? (
          <div className="more-actions">
            <button type="button" className="more-button more-button--secondary" onClick={() => void handlePickFolder()}>
              Choose backup folder
            </button>
            {hasBackupFolder ? (
              <button
                type="button"
                className="more-button more-button--secondary"
                onClick={() => void handleClearFolder()}
              >
                Clear folder
              </button>
            ) : null}
          </div>
        ) : null}

        {backupMessage ? (
          <p className="more-status" role="status" aria-live="polite">
            {backupMessage}
          </p>
        ) : null}
      </section>

      <section className="more-section" aria-labelledby="export-import-heading">
        <h2 id="export-import-heading" className="more-section__title">
          Export &amp; import
        </h2>

        <p className="more-help">
          Vault export is Markdown inside a zip. JSON export includes entries, packs, skins, and
          settings — optionally encrypted with a passphrase.
        </p>

        <div className="more-actions">
          <button
            type="button"
            className="more-button"
            disabled={dataBusy}
            onClick={() => void handleExportVault()}
          >
            Export vault
          </button>
          <button
            type="button"
            className="more-button more-button--secondary"
            disabled={dataBusy}
            onClick={() => void handleExportJson()}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="more-button more-button--secondary"
            disabled={dataBusy}
            onClick={() => importInputRef.current?.click()}
          >
            {dataBusy ? "Working…" : "Import"}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".zip,.json,application/json,application/zip"
            hidden
            onChange={handleImportChange}
          />
        </div>

        {dataMessage ? (
          <p className="more-status" role="status" aria-live="polite">
            {dataMessage}
          </p>
        ) : null}

        {vaultPreview ? (
          <div className="more-vault-preview" role="region" aria-labelledby="vault-preview-heading">
            <h3 id="vault-preview-heading" className="more-section__subtitle">
              Vault import preview
            </h3>
            <ul className="more-preview-stats">
              <li>{vaultPreview.newEntries.length} new</li>
              <li>{vaultPreview.unchanged.length} unchanged</li>
              <li>{vaultPreview.conflicts.length} conflicts</li>
              {vaultPreview.errors.length > 0 ? (
                <li>{vaultPreview.errors.length} rejected files</li>
              ) : null}
            </ul>
            {vaultPreview.conflicts.length > 0 ? (
              <label className="more-toggle">
                <input
                  type="checkbox"
                  checked={forceOverwriteConflicts}
                  onChange={(event) => setForceOverwriteConflicts(event.target.checked)}
                />
                <span>Force overwrite conflicting dates (import wins)</span>
              </label>
            ) : null}
            <div className="more-actions">
              <button
                type="button"
                className="more-button"
                disabled={dataBusy}
                onClick={() => void confirmVaultImport()}
              >
                {dataBusy ? "Importing…" : "Import vault"}
              </button>
              <button
                type="button"
                className="more-button more-button--secondary"
                disabled={dataBusy}
                onClick={cancelVaultImport}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <nav className="more-links">
        <Link className="more-link" to="/packs">
          Theme and Prompt Packs
        </Link>
      </nav>

      <section className="more-section" aria-labelledby="about-heading">
        <h2 id="about-heading" className="more-section__title">
          About
        </h2>
        <p className="more-help">
          DiaryDeck is free to use and modify for non-commercial purposes under
          the{" "}
          <a
            className="more-inline-link"
            href="https://polyformproject.org/licenses/noncommercial/1.0.0"
            target="_blank"
            rel="noreferrer"
          >
            PolyForm Noncommercial 1.0.0
          </a>{" "}
          license. Source is on{" "}
          <a
            className="more-inline-link"
            href="https://github.com/KelpStack/journaling"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          .
        </p>
        <p className="more-help">
          All of your journal data stays offline on this device. Nothing is
          uploaded to a server.
        </p>
        <p className="more-help">
          Backups are your responsibility. Export regularly if you want a copy
          you can restore later — clearing site data, switching browsers, or
          losing this device can wipe your entries.
        </p>
      </section>

      <section className="more-section more-section--danger" aria-labelledby="danger-zone-heading">
        <h2 id="danger-zone-heading" className="more-section__title">
          Danger zone
        </h2>
        <p className="more-help">
          Permanently erase all journal entries, packs, skins, settings, and search
          data on this device, then restore built-in packs and skins.
        </p>
        <button
          type="button"
          className="more-button more-button--danger"
          disabled={dataBusy}
          onClick={() => void handleDeleteAllData()}
        >
          {dataBusy ? "Working…" : "Delete all data"}
        </button>
      </section>
    </div>
  );
}
