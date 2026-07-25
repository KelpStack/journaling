import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Pause, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { downloadBlob } from "../../backup/download";
import { deletePack, listPacks, putPack } from "../../db/packsRepo";
import { getSettings, saveSettings } from "../../db/settingsRepo";
import { deleteSkin, listSkins, putSkin } from "../../db/skinsRepo";
import type { ContentPack, ProfileSettings, Skin } from "../../domain/types";
import { HFL_PACK, isBuiltInPack } from "../../packs/builtInPacks";
import { isBuiltInSkin, OCEAN_SKIN } from "../../packs/builtInSkins";
import { HFL_SKIN } from "../../packs/hflBuiltIn";
import { TRAVEL_LOG_PACK } from "../../packs/travelLogSample";
import { bundleZipFilename, exportBundleZip } from "../../packs/exportZip";
import { importBundleZip } from "../../packs/importZip";
import { applySkin } from "../skin/applySkin";
import {
  ContentPackEditor,
  createEmptyContentPack,
} from "./ContentPackEditor";
import { createEmptySkin, SkinEditor } from "./SkinEditor";

const PROFILE_ID = "local";

const BUILT_IN_SKINS: Record<string, Skin> = {
  [HFL_SKIN.id]: HFL_SKIN,
  [OCEAN_SKIN.id]: OCEAN_SKIN,
};

const BUILT_IN_PACKS: Record<string, ContentPack> = {
  [HFL_PACK.id]: HFL_PACK,
  [TRAVEL_LOG_PACK.id]: TRAVEL_LOG_PACK,
};
type EditorMode =
  | { kind: "none" }
  | { kind: "pack-new" }
  | { kind: "pack-edit"; pack: ContentPack }
  | { kind: "skin-new" }
  | { kind: "skin-edit"; skin: Skin };

export function PacksPage() {
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [packs, setPacks] = useState<ContentPack[]>([]);
  const [skins, setSkins] = useState<Skin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [editor, setEditor] = useState<EditorMode>({ kind: "none" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    const [loadedSettings, loadedPacks, loadedSkins] = await Promise.all([
      getSettings(PROFILE_ID),
      listPacks(),
      listSkins(),
    ]);

    if (!loadedSettings) {
      throw new Error("Settings not found");
    }

    setSettings(loadedSettings);
    setPacks(loadedPacks);
    setSkins(loadedSkins);

    const activeSkin =
      loadedSkins.find((skin) => skin.id === loadedSettings.activeSkinId) ??
      OCEAN_SKIN;
    applySkin(activeSkin);

    return { settings: loadedSettings, packs: loadedPacks, skins: loadedSkins };
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
          setLoadError(
            error instanceof Error ? error.message : "Failed to load packs",
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
  }, [reload]);

  const persistSettings = async (next: ProfileSettings) => {
    await saveSettings(next);
    setSettings(next);

    const activeSkin =
      skins.find((skin) => skin.id === next.activeSkinId) ?? OCEAN_SKIN;
    applySkin(activeSkin);
  };

  const togglePackActive = async (packId: string) => {
    if (!settings) return;

    const isActive = settings.activeContentPackIds.includes(packId);
    const activeContentPackIds = isActive
      ? settings.activeContentPackIds.filter((id) => id !== packId)
      : [...settings.activeContentPackIds, packId];

    await persistSettings({
      ...settings,
      activeContentPackIds,
    });
  };

  const moveActivePack = async (packId: string, direction: -1 | 1) => {
    if (!settings) return;

    const ids = [...settings.activeContentPackIds];
    const index = ids.indexOf(packId);
    if (index < 0) return;

    const target = index + direction;
    if (target < 0 || target >= ids.length) return;

    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    await persistSettings({ ...settings, activeContentPackIds: ids });
  };

  const selectSkin = async (skinId: string) => {
    if (!settings || settings.activeSkinId === skinId) return;
    await persistSettings({ ...settings, activeSkinId: skinId });
  };

  const handleImport = async (data: ArrayBuffer | Blob) => {
    setImportError(null);
    setImporting(true);
    try {
      await importBundleZip(data, { profileId: PROFILE_ID });
      await reload();
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Import failed",
      );
    } finally {
      setImporting(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void handleImport(file);
  };

  const importSample = async (filename: string) => {
    setImportError(null);
    setImporting(true);
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}samples/${filename}`,
      );
      if (!response.ok) {
        throw new Error(`Sample not found (${response.status})`);
      }
      const blob = await response.blob();
      await importBundleZip(blob, { profileId: PROFILE_ID });
      await reload();
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Sample import failed",
      );
    } finally {
      setImporting(false);
    }
  };

  const handleExportActiveBundle = async () => {
    if (!settings) return;

    setExportError(null);
    setExporting(true);
    try {
      const name = "active-journal-setup";
      const blob = await exportBundleZip({
        name,
        version: "1.0.0",
        skinIds: [settings.activeSkinId],
        contentPackIds: settings.activeContentPackIds,
        activateOnImport: {
          skinId: settings.activeSkinId,
          contentPackIds: settings.activeContentPackIds,
        },
      });
      downloadBlob(blob, bundleZipFilename(name));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleExportPack = async (pack: ContentPack) => {
    if (!settings) return;

    setExportError(null);
    setExporting(true);
    try {
      const blob = await exportBundleZip({
        name: pack.name,
        version: pack.version ?? "1.0.0",
        contentPackIds: [pack.id],
      });
      downloadBlob(blob, bundleZipFilename(pack.name));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleExportSkin = async (skin: Skin) => {
    setExportError(null);
    setExporting(true);
    try {
      const blob = await exportBundleZip({
        name: skin.name,
        version: "1.0.0",
        skinIds: [skin.id],
      });
      downloadBlob(blob, bundleZipFilename(skin.name));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const savePack = async (pack: ContentPack) => {
    await putPack(pack);
    if (settings && !settings.activeContentPackIds.includes(pack.id)) {
      await saveSettings({
        ...settings,
        activeContentPackIds: [...settings.activeContentPackIds, pack.id],
      });
    }
    setEditor({ kind: "none" });
    await reload();
  };

  const saveSkin = async (skin: Skin) => {
    await putSkin(skin);
    if (settings) {
      await saveSettings({ ...settings, activeSkinId: skin.id });
    }
    setEditor({ kind: "none" });
    await reload();
  };

  const handleDeleteSkin = async (skin: Skin) => {
    if (isBuiltInSkin(skin.id)) {
      return;
    }
    const confirmed = window.confirm(
      `Delete skin “${skin.name}”? This cannot be undone (re-import the zip if you still have it).`,
    );
    if (!confirmed || !settings) {
      return;
    }

    setExportError(null);
    try {
      await deleteSkin(skin.id);

      if (settings.activeSkinId === skin.id) {
        await saveSettings({ ...settings, activeSkinId: OCEAN_SKIN.id });
        applySkin(OCEAN_SKIN);
      }

      await reload();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const handleRestoreSkin = async (skin: Skin) => {
    const builtIn = BUILT_IN_SKINS[skin.id];
    if (!builtIn) return;
    const confirmed = window.confirm(
      `Restore built-in skin “${skin.name}”? This overwrites your local edits to this skin.`,
    );
    if (!confirmed) return;
    setExportError(null);
    try {
      await putSkin(builtIn);
      if (settings?.activeSkinId === builtIn.id) {
        applySkin(builtIn);
      }
      await reload();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Restore failed");
    }
  };

  const handleDeletePack = async (pack: ContentPack) => {
    if (isBuiltInPack(pack.id)) {
      return;
    }
    const confirmed = window.confirm(
      `Delete content pack “${pack.name}”? This cannot be undone.`,
    );
    if (!confirmed || !settings) {
      return;
    }

    setExportError(null);
    try {
      await deletePack(pack.id);
      if (settings.activeContentPackIds.includes(pack.id)) {
        await persistSettings({
          ...settings,
          activeContentPackIds: settings.activeContentPackIds.filter(
            (id) => id !== pack.id,
          ),
        });
      }
      await reload();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Delete failed");
    }
  };

  const handleRestorePack = async (pack: ContentPack) => {
    const builtIn = BUILT_IN_PACKS[pack.id];
    if (!builtIn) return;
    const confirmed = window.confirm(
      `Restore built-in pack “${pack.name}”? This overwrites your local edits to this pack.`,
    );
    if (!confirmed) return;
    setExportError(null);
    try {
      await putPack(builtIn);
      await reload();
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Restore failed");
    }
  };

  const activePacks = settings
    ? settings.activeContentPackIds
        .map((id) => packs.find((pack) => pack.id === id))
        .filter((pack): pack is ContentPack => !!pack)
    : [];

  const inactivePacks = packs.filter(
    (pack) => !settings?.activeContentPackIds.includes(pack.id),
  );

  if (loading) {
    return <p className="packs-loading">Loading packs…</p>;
  }

  if (loadError) {
    return <p className="packs-error">{loadError}</p>;
  }

  if (editor.kind === "pack-new") {
    return (
      <ContentPackEditor
        initial={createEmptyContentPack()}
        onSave={savePack}
        onCancel={() => setEditor({ kind: "none" })}
      />
    );
  }

  if (editor.kind === "pack-edit") {
    return (
      <ContentPackEditor
        initial={editor.pack}
        onSave={savePack}
        onCancel={() => setEditor({ kind: "none" })}
      />
    );
  }

  if (editor.kind === "skin-new") {
    return (
      <SkinEditor
        initial={createEmptySkin()}
        onSave={saveSkin}
        onCancel={() => setEditor({ kind: "none" })}
      />
    );
  }

  if (editor.kind === "skin-edit") {
    return (
      <SkinEditor
        initial={editor.skin}
        onSave={saveSkin}
        onCancel={() => setEditor({ kind: "none" })}
      />
    );
  }

  return (
    <div className="packs-page">
      <h1 className="packs-page__title">Theme and Prompt Packs</h1>

      <section className="packs-section">
        <h2 className="packs-section__title">Export</h2>
        <div className="packs-import">
          <button
            type="button"
            className="packs-btn"
            disabled={exporting || !settings}
            onClick={() => void handleExportActiveBundle()}
          >
            {exporting ? "Exporting…" : "Export active skin & packs"}
          </button>
        </div>
        {exportError && <p className="packs-error">{exportError}</p>}
      </section>

      <section className="packs-section">
        <h2 className="packs-section__title">Import</h2>
        <p className="packs-muted">
          Import theme or prompt pack zip. Journal backups are in Settings.
        </p>
        <div className="packs-import">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip,application/zip"
            className="packs-import__file-input"
            onChange={handleFileChange}
            disabled={importing}
            tabIndex={-1}
            aria-hidden="true"
          />
          <button
            type="button"
            className="packs-btn packs-btn--primary"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? "Importing…" : "Choose file"}
          </button>
        </div>
        {importError && <p className="packs-error">{importError}</p>}
      </section>

      <section className="packs-section">
        <h2 className="packs-section__title">Import Sample Packs</h2>
        <p className="packs-muted">
          Sample sets you can reference to create your own.
        </p>
        <ul className="packs-sample-list">
          <li className="packs-sample-list__item">
            <div className="packs-sample-list__copy">
              <span className="packs-sample-list__name">Lined Journal</span>
              <span className="packs-sample-list__meta">Theme pack</span>
            </div>
            <button
              type="button"
              className="packs-btn"
              disabled={importing}
              onClick={() => void importSample("lined-journal.zip")}
            >
              {importing ? "Importing…" : "Import"}
            </button>
          </li>
          <li className="packs-sample-list__item">
            <div className="packs-sample-list__copy">
              <span className="packs-sample-list__name">Media Tracker</span>
              <span className="packs-sample-list__meta">Prompt pack</span>
            </div>
            <button
              type="button"
              className="packs-btn"
              disabled={importing}
              onClick={() => void importSample("media-tracker.zip")}
            >
              {importing ? "Importing…" : "Import"}
            </button>
          </li>
        </ul>
      </section>

      <section className="packs-section">
        <h2 className="packs-section__title">Active skin</h2>
        <ul className="packs-list">
          {skins.map((skin) => (
            <li key={skin.id} className="packs-list__item">
              <label className="packs-list__label">
                <input
                  type="radio"
                  name="active-skin"
                  checked={settings?.activeSkinId === skin.id}
                  onChange={() => void selectSkin(skin.id)}
                />
                <span>{skin.name}</span>
                <span className="packs-list__meta">{skin.id}</span>
              </label>
              <div className="packs-list__actions">
                <button
                  type="button"
                  className="packs-btn packs-btn--icon"
                  disabled={exporting}
                  aria-label={`Export ${skin.name}`}
                  title="Export"
                  onClick={() => void handleExportSkin(skin)}
                >
                  <Download size={16} strokeWidth={1.75} aria-hidden />
                </button>
                <button
                  type="button"
                  className="packs-btn packs-btn--icon"
                  aria-label={`Edit ${skin.name}`}
                  title="Edit"
                  onClick={() => setEditor({ kind: "skin-edit", skin })}
                >
                  <Pencil size={16} strokeWidth={1.75} aria-hidden />
                </button>
                {isBuiltInSkin(skin.id) ? (
                  <button
                    type="button"
                    className="packs-btn packs-btn--icon"
                    aria-label={`Restore ${skin.name}`}
                    title="Restore built-in"
                    onClick={() => void handleRestoreSkin(skin)}
                  >
                    <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="packs-btn packs-btn--icon"
                    aria-label={`Delete ${skin.name}`}
                    title="Delete"
                    onClick={() => void handleDeleteSkin(skin)}
                  >
                    <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="packs-btn packs-btn--ghost"
          onClick={() => setEditor({ kind: "skin-new" })}
        >
          Create skin
        </button>
      </section>

      <section className="packs-section">
        <h2 className="packs-section__title">Active content packs</h2>
        {activePacks.length === 0 ? (
          <p className="packs-muted">No active packs. Enable packs below.</p>
        ) : (
          <ul className="packs-list">
            {activePacks.map((pack, index) => (
              <li key={pack.id} className="packs-list__item">
                <span className="packs-list__name">{pack.name}</span>
                <div className="packs-list__actions">
                  <button
                    type="button"
                    className="packs-btn packs-btn--ghost"
                    aria-label={`Move ${pack.name} up`}
                    disabled={index === 0}
                    onClick={() => void moveActivePack(pack.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="packs-btn packs-btn--ghost"
                    aria-label={`Move ${pack.name} down`}
                    disabled={index === activePacks.length - 1}
                    onClick={() => void moveActivePack(pack.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="packs-btn packs-btn--icon"
                    disabled={exporting}
                    aria-label={`Export ${pack.name}`}
                    title="Export"
                    onClick={() => void handleExportPack(pack)}
                  >
                    <Download size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="packs-btn packs-btn--icon"
                    aria-label={`Edit ${pack.name}`}
                    title="Edit"
                    onClick={() => setEditor({ kind: "pack-edit", pack })}
                  >
                    <Pencil size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="packs-btn packs-btn--icon"
                    aria-label={`Pause ${pack.name}`}
                    title="Pause"
                    onClick={() => void togglePackActive(pack.id)}
                  >
                    <Pause size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                  {isBuiltInPack(pack.id) ? (
                    <button
                      type="button"
                      className="packs-btn packs-btn--icon"
                      aria-label={`Restore ${pack.name}`}
                      title="Restore built-in"
                      onClick={() => void handleRestorePack(pack)}
                    >
                      <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="packs-btn packs-btn--icon"
                      aria-label={`Delete ${pack.name}`}
                      title="Delete"
                      onClick={() => void handleDeletePack(pack)}
                    >
                      <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="packs-section">
        <h2 className="packs-section__title">Installed content packs</h2>
        <ul className="packs-list">
          {inactivePacks.map((pack) => (
            <li key={pack.id} className="packs-list__item">
              <label className="packs-list__label">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => void togglePackActive(pack.id)}
                />
                <span>{pack.name}</span>
                <span className="packs-list__meta">{pack.id}</span>
              </label>
              <div className="packs-list__actions">
                <button
                  type="button"
                  className="packs-btn packs-btn--icon"
                  disabled={exporting}
                  aria-label={`Export ${pack.name}`}
                  title="Export"
                  onClick={() => void handleExportPack(pack)}
                >
                  <Download size={16} strokeWidth={1.75} aria-hidden />
                </button>
                <button
                  type="button"
                  className="packs-btn packs-btn--icon"
                  aria-label={`Edit ${pack.name}`}
                  title="Edit"
                  onClick={() => setEditor({ kind: "pack-edit", pack })}
                >
                  <Pencil size={16} strokeWidth={1.75} aria-hidden />
                </button>
                {isBuiltInPack(pack.id) ? (
                  <button
                    type="button"
                    className="packs-btn packs-btn--icon"
                    aria-label={`Restore ${pack.name}`}
                    title="Restore built-in"
                    onClick={() => void handleRestorePack(pack)}
                  >
                    <RotateCcw size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="packs-btn packs-btn--icon"
                    aria-label={`Delete ${pack.name}`}
                    title="Delete"
                    onClick={() => void handleDeletePack(pack)}
                  >
                    <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="packs-btn packs-btn--ghost"
          onClick={() => setEditor({ kind: "pack-new" })}
        >
          Create content pack
        </button>
      </section>
    </div>
  );
}
