import { useRef, useState } from "react";
import type {
  BackgroundFit,
  CustomAsset,
  Skin,
  SkinFonts,
  SkinOpacity,
  SurfaceStyle,
} from "../../domain/types";
import {
  formatMb,
  MAX_CUSTOM_ASSETS,
  MAX_FONT_BYTES,
  MAX_IMAGE_BYTES,
} from "../../packs/assetLimits";
import { fileToDataUrl } from "./imageFile";

export interface SkinEditorProps {
  initial: Skin;
  onSave: (skin: Skin) => Promise<void>;
  onCancel: () => void;
}

type FontKey = keyof SkinFonts;

const FONT_LABELS: Record<FontKey, string> = {
  displayDataUrl: "Display font file",
  bodyDataUrl: "Body font file",
};

const SURFACE_STYLE_LABELS: Record<SurfaceStyle, string> = {
  flat: "Flat",
  card: "Card",
  sticky: "Sticky note",
  paper: "Ruled paper",
};

const ASSET_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;

const DEFAULT_OPACITY: SkinOpacity = { surface: 0.9, chrome: 0.92, field: 0.95 };

function emptySkin(): Skin {
  return {
    id: "",
    name: "",
    version: "1.0.0",
    tokens: {
      bg: "#f4f7f9",
      fg: "#1a2b33",
      accent: "#3d6b7a",
      muted: "#6b8491",
      fontDisplay: "system-ui, sans-serif",
      fontBody: "system-ui, sans-serif",
    },
    backgroundFit: "tile",
    opacity: { ...DEFAULT_OPACITY },
    panelStyle: "flat",
    customAssets: [],
  };
}

export function createEmptySkin(): Skin {
  return emptySkin();
}

export function SkinEditor({ initial, onSave, onCancel }: SkinEditorProps) {
  const [skin, setSkin] = useState<Skin>({
    ...initial,
    backgroundFit: initial.backgroundFit ?? "tile",
    opacity: {
      surface: initial.opacity?.surface ?? DEFAULT_OPACITY.surface,
      chrome: initial.opacity?.chrome ?? DEFAULT_OPACITY.chrome,
      field: initial.opacity?.field ?? DEFAULT_OPACITY.field,
    },
    panelStyle: initial.panelStyle ?? "flat",
    customAssets: initial.customAssets ?? [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [newAssetKey, setNewAssetKey] = useState("");
  const assetFileInputRef = useRef<HTMLInputElement>(null);

  const updateToken = (key: keyof Skin["tokens"], value: string) => {
    setSkin((current) => ({
      ...current,
      tokens: { ...current.tokens, [key]: value },
    }));
  };

  const updateOpacity = (key: keyof SkinOpacity, value: number) => {
    setSkin((current) => ({
      ...current,
      opacity: {
        surface: current.opacity?.surface ?? DEFAULT_OPACITY.surface,
        chrome: current.opacity?.chrome ?? DEFAULT_OPACITY.chrome,
        field: current.opacity?.field ?? DEFAULT_OPACITY.field,
        [key]: value,
      },
    }));
  };

  const handleBackgroundChange = async (file: File | undefined) => {
    setAssetError(null);
    if (!file) {
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file, MAX_IMAGE_BYTES);
      setSkin((current) => ({
        ...current,
        images: { ...current.images, tilingBackground: dataUrl },
      }));
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : "Failed to load image");
    }
  };

  const clearBackground = () => {
    setSkin((current) => {
      if (!current.images?.tilingBackground) {
        return current;
      }
      const { tilingBackground: _drop, ...rest } = current.images;
      return { ...current, images: Object.keys(rest).length > 0 ? rest : undefined };
    });
  };

  const handleFontChange = async (key: FontKey, file: File | undefined) => {
    setAssetError(null);
    if (!file) {
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file, MAX_FONT_BYTES);
      setSkin((current) => ({
        ...current,
        fonts: { ...current.fonts, [key]: dataUrl },
      }));
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : "Failed to load font");
    }
  };

  const clearFont = (key: FontKey) => {
    setSkin((current) => {
      if (!current.fonts) {
        return current;
      }
      const fonts = { ...current.fonts };
      delete fonts[key];
      return {
        ...current,
        fonts: Object.keys(fonts).length > 0 ? fonts : undefined,
      };
    });
  };

  const handleAddAsset = async (file: File | undefined) => {
    setAssetError(null);
    if (!file) {
      return;
    }

    const key = newAssetKey.trim();
    const existing = skin.customAssets ?? [];

    if (!key) {
      setAssetError("Give the asset a name first");
      return;
    }
    if (!ASSET_KEY_PATTERN.test(key)) {
      setAssetError("Asset names can only use letters, numbers, - and _");
      return;
    }
    if (existing.some((asset) => asset.key === key)) {
      setAssetError(`"${key}" is already used`);
      return;
    }
    if (existing.length >= MAX_CUSTOM_ASSETS) {
      setAssetError(`Max ${MAX_CUSTOM_ASSETS} custom assets per skin`);
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file, MAX_IMAGE_BYTES);
      const asset: CustomAsset = { key, dataUrl };
      setSkin((current) => ({
        ...current,
        customAssets: [...(current.customAssets ?? []), asset],
      }));
      setNewAssetKey("");
      if (assetFileInputRef.current) {
        assetFileInputRef.current.value = "";
      }
    } catch (err) {
      setAssetError(err instanceof Error ? err.message : "Failed to load image");
    }
  };

  const removeAsset = (key: string) => {
    setSkin((current) => ({
      ...current,
      customAssets: (current.customAssets ?? []).filter((asset) => asset.key !== key),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!skin.id.trim() || !skin.name.trim()) {
      setError("Id and name are required");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        ...skin,
        id: skin.id.trim(),
        name: skin.name.trim(),
        backgroundFit: skin.backgroundFit ?? "tile",
        opacity: {
          surface: skin.opacity?.surface ?? DEFAULT_OPACITY.surface,
          chrome: skin.opacity?.chrome ?? DEFAULT_OPACITY.chrome,
          field: skin.opacity?.field ?? DEFAULT_OPACITY.field,
        },
        panelStyle: skin.panelStyle ?? "flat",
        customAssets: skin.customAssets ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save skin");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="pack-editor" onSubmit={(event) => void handleSubmit(event)}>
      <h2 className="pack-editor__title">{initial.id ? "Edit skin" : "New skin"}</h2>

      <label className="pack-editor__field">
        <span className="pack-editor__label">Id</span>
        <input
          className="pack-editor__input"
          value={skin.id}
          onChange={(event) => setSkin({ ...skin, id: event.target.value })}
          required
          disabled={!!initial.id}
        />
      </label>

      <label className="pack-editor__field">
        <span className="pack-editor__label">Name</span>
        <input
          className="pack-editor__input"
          value={skin.name}
          onChange={(event) => setSkin({ ...skin, name: event.target.value })}
          required
        />
      </label>

      <label className="pack-editor__field">
        <span className="pack-editor__label">Version</span>
        <input
          className="pack-editor__input"
          value={skin.version}
          onChange={(event) => setSkin({ ...skin, version: event.target.value })}
        />
      </label>

      <fieldset className="pack-editor__fieldset">
        <legend className="pack-editor__legend">Colors</legend>
        {(
          [
            ["bg", "Background"],
            ["fg", "Foreground"],
            ["accent", "Accent"],
            ["muted", "Muted"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="pack-editor__field">
            <span className="pack-editor__label">{label}</span>
            <input
              className="pack-editor__input"
              type="color"
              value={
                /^#[0-9a-fA-F]{6}$/.test(skin.tokens[key])
                  ? skin.tokens[key]
                  : "#000000"
              }
              onChange={(event) => updateToken(key, event.target.value)}
            />
            <input
              className="pack-editor__input"
              value={skin.tokens[key]}
              onChange={(event) => updateToken(key, event.target.value)}
            />
          </label>
        ))}
      </fieldset>

      <fieldset className="pack-editor__fieldset">
        <legend className="pack-editor__legend">Opacity</legend>
        <label className="pack-editor__field">
          <span className="pack-editor__label">
            Panels ({Math.round((skin.opacity?.surface ?? DEFAULT_OPACITY.surface) * 100)}%)
          </span>
          <input
            className="pack-editor__range"
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={skin.opacity?.surface ?? DEFAULT_OPACITY.surface}
            onChange={(event) => updateOpacity("surface", Number(event.target.value))}
          />
        </label>
        <label className="pack-editor__field">
          <span className="pack-editor__label">
            Nav / chrome ({Math.round((skin.opacity?.chrome ?? DEFAULT_OPACITY.chrome) * 100)}%)
          </span>
          <input
            className="pack-editor__range"
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={skin.opacity?.chrome ?? DEFAULT_OPACITY.chrome}
            onChange={(event) => updateOpacity("chrome", Number(event.target.value))}
          />
        </label>
        <label className="pack-editor__field">
          <span className="pack-editor__label">
            Fields ({Math.round((skin.opacity?.field ?? DEFAULT_OPACITY.field!) * 100)}%)
          </span>
          <input
            className="pack-editor__range"
            type="range"
            min={0.2}
            max={1}
            step={0.05}
            value={skin.opacity?.field ?? DEFAULT_OPACITY.field}
            onChange={(event) => updateOpacity("field", Number(event.target.value))}
          />
        </label>
      </fieldset>

      <fieldset className="pack-editor__fieldset">
        <legend className="pack-editor__legend">Surface style</legend>
        <label className="pack-editor__field">
          <span className="pack-editor__label">Panel / card shape</span>
          <select
            className="pack-editor__input"
            value={skin.panelStyle ?? "flat"}
            onChange={(event) =>
              setSkin({ ...skin, panelStyle: event.target.value as SurfaceStyle })
            }
          >
            {(Object.keys(SURFACE_STYLE_LABELS) as SurfaceStyle[]).map((key) => (
              <option key={key} value={key}>
                {SURFACE_STYLE_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="pack-editor__fieldset">
        <legend className="pack-editor__legend">Fonts</legend>
        <label className="pack-editor__field">
          <span className="pack-editor__label">Display fallback stack</span>
          <input
            className="pack-editor__input"
            value={skin.tokens.fontDisplay}
            onChange={(event) => updateToken("fontDisplay", event.target.value)}
          />
        </label>
        <label className="pack-editor__field">
          <span className="pack-editor__label">Body fallback stack</span>
          <input
            className="pack-editor__input"
            value={skin.tokens.fontBody}
            onChange={(event) => updateToken("fontBody", event.target.value)}
          />
        </label>
        {(Object.keys(FONT_LABELS) as FontKey[]).map((key) => (
          <div key={key} className="pack-editor__image-row">
            <span className="pack-editor__label">
              {FONT_LABELS[key]} (max {formatMb(MAX_FONT_BYTES)}MB)
            </span>
            {skin.fonts?.[key] && (
              <span className="pack-editor__hint">Custom font uploaded</span>
            )}
            <input
              type="file"
              accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
              onChange={(event) => void handleFontChange(key, event.target.files?.[0])}
            />
            {skin.fonts?.[key] && (
              <button
                type="button"
                className="packs-btn packs-btn--ghost"
                onClick={() => clearFont(key)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </fieldset>

      <fieldset className="pack-editor__fieldset">
        <legend className="pack-editor__legend">
          Background image (max {formatMb(MAX_IMAGE_BYTES)}MB)
        </legend>
        <label className="pack-editor__field">
          <span className="pack-editor__label">Placement</span>
          <select
            className="pack-editor__input"
            value={skin.backgroundFit ?? "tile"}
            onChange={(event) =>
              setSkin({
                ...skin,
                backgroundFit: event.target.value as BackgroundFit,
              })
            }
          >
            <option value="tile">Tile</option>
            <option value="center">Center (contain)</option>
            <option value="cover">Cover</option>
          </select>
        </label>
        <div className="pack-editor__image-row">
          <span className="pack-editor__label">Background</span>
          {skin.images?.tilingBackground && (
            <img
              className="pack-editor__image-preview"
              src={skin.images.tilingBackground}
              alt="Background preview"
            />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(event) => void handleBackgroundChange(event.target.files?.[0])}
          />
          {skin.images?.tilingBackground && (
            <button
              type="button"
              className="packs-btn packs-btn--ghost"
              onClick={clearBackground}
            >
              Remove
            </button>
          )}
        </div>
      </fieldset>

      <fieldset className="pack-editor__fieldset">
        <legend className="pack-editor__legend">
          Custom assets ({(skin.customAssets ?? []).length}/{MAX_CUSTOM_ASSETS}, max{" "}
          {formatMb(MAX_IMAGE_BYTES)}MB each)
        </legend>
        <p className="pack-editor__hint">
          Freeform images for use in Custom CSS below — not shown anywhere by
          themselves. Each becomes <code>var(--skin-asset-&lt;name&gt;)</code>.
        </p>
        {(skin.customAssets ?? []).map((asset) => (
          <div key={asset.key} className="pack-editor__image-row">
            <span className="pack-editor__label">
              {asset.key} → <code>var(--skin-asset-{asset.key})</code>
            </span>
            <img
              className="pack-editor__image-preview"
              src={asset.dataUrl}
              alt={`${asset.key} preview`}
            />
            <button
              type="button"
              className="packs-btn packs-btn--ghost"
              onClick={() => removeAsset(asset.key)}
            >
              Remove
            </button>
          </div>
        ))}
        {(skin.customAssets ?? []).length < MAX_CUSTOM_ASSETS && (
          <div className="pack-editor__image-row">
            <span className="pack-editor__label">Add asset</span>
            <input
              className="pack-editor__input"
              placeholder="name, e.g. corner-sticker"
              value={newAssetKey}
              onChange={(event) => setNewAssetKey(event.target.value)}
            />
            <input
              ref={assetFileInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => void handleAddAsset(event.target.files?.[0])}
            />
          </div>
        )}
        {assetError && <p className="pack-editor__error">{assetError}</p>}
      </fieldset>

      <fieldset className="pack-editor__fieldset">
        <legend className="pack-editor__legend">Custom CSS</legend>
        <p className="pack-editor__hint">
          Raw CSS applied whenever this skin is active.{" "}
          <a
            className="pack-editor__ref-link"
            href={`${import.meta.env.BASE_URL}docs/skin-css-reference.html`}
            target="_blank"
            rel="noreferrer"
          >
            Skin CSS reference
          </a>{" "}
          explains what each variable and class touches. Available vars:{" "}
          <code>--skin-bg</code>, <code>--skin-fg</code>, <code>--skin-accent</code>,{" "}
          <code>--skin-muted</code>, <code>--skin-font-display</code>,{" "}
          <code>--skin-font-body</code>, <code>--skin-surface-opacity</code>,{" "}
          <code>--skin-chrome-opacity</code>, <code>--skin-field-opacity</code>,{" "}
          <code>--skin-field-bg</code>, <code>--skin-field-fg</code>,{" "}
          <code>--skin-field-border</code>, plus <code>--skin-asset-&lt;name&gt;</code>{" "}
          for each custom asset above. Entry date typography:{" "}
          <code>--skin-entry-date-size</code>, <code>--skin-entry-date-weight</code>,{" "}
          <code>--skin-entry-date-family</code>. <code>[data-panel-style]</code> is set on{" "}
          <code>&lt;html&gt;</code>.
        </p>
        <textarea
          className="pack-editor__input pack-editor__textarea"
          rows={6}
          spellCheck={false}
          value={skin.customCss ?? ""}
          onChange={(event) => setSkin({ ...skin, customCss: event.target.value })}
          placeholder=".pack-section::after { content: var(--skin-asset-corner-sticker); ... }"
        />
      </fieldset>

      {error && <p className="pack-editor__error">{error}</p>}

      <div className="pack-editor__actions">
        <button type="button" className="packs-btn packs-btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="packs-btn" disabled={saving}>
          {saving ? "Saving…" : "Save skin"}
        </button>
      </div>
    </form>
  );
}
