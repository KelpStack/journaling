import type { BackgroundFit, Skin } from "../../domain/types";

const DISPLAY_FONT_STYLE_ID = "hfl-skin-font-display";
const BODY_FONT_STYLE_ID = "hfl-skin-font-body";
const DISPLAY_FAMILY = "HFLSkinDisplay";
const BODY_FAMILY = "HFLSkinBody";
const CUSTOM_CSS_STYLE_ID = "hfl-skin-custom-css";

/** Var names set by the previously-applied skin's customAssets, so we can
 * clear stale ones before applying the next skin's (different) asset keys. */
let previousAssetVarNames: string[] = [];

function sanitizeAssetKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "");
}

function fontFormatFromDataUrl(dataUrl: string): string {
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1]?.toLowerCase() ?? "";
  if (mime.includes("woff2")) return "woff2";
  if (mime.includes("woff")) return "woff";
  if (mime.includes("ttf") || mime.includes("truetype")) return "truetype";
  if (mime.includes("otf") || mime.includes("opentype")) return "opentype";
  return "truetype";
}

function setFontFace(styleId: string, family: string, dataUrl: string | undefined) {
  let el = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!dataUrl) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = styleId;
    document.head.appendChild(el);
  }
  const format = fontFormatFromDataUrl(dataUrl);
  el.textContent = `
@font-face {
  font-family: "${family}";
  src: url("${dataUrl}") format("${format}");
  font-display: swap;
}
`.trim();
}

function backgroundFitStyles(fit: BackgroundFit | undefined): {
  repeat: string;
  position: string;
  size: string;
} {
  switch (fit) {
    case "center":
      return { repeat: "no-repeat", position: "center center", size: "contain" };
    case "cover":
      return { repeat: "no-repeat", position: "center center", size: "cover" };
    case "tile":
    default:
      return { repeat: "repeat", position: "0 0", size: "auto" };
  }
}

export function applySkin(skin: Skin): void {
  const root = document.documentElement;
  root.style.setProperty("--skin-bg", skin.tokens.bg);
  root.style.setProperty("--skin-fg", skin.tokens.fg);
  root.style.setProperty("--skin-accent", skin.tokens.accent);
  root.style.setProperty("--skin-muted", skin.tokens.muted);

  const surface = skin.opacity?.surface ?? 0.9;
  const chrome = skin.opacity?.chrome ?? 0.92;
  const fieldOpacity = skin.opacity?.field ?? 0.95;
  root.style.setProperty(
    "--skin-surface-opacity",
    String(Math.min(1, Math.max(0, surface))),
  );
  root.style.setProperty(
    "--skin-chrome-opacity",
    String(Math.min(1, Math.max(0, chrome))),
  );
  root.style.setProperty(
    "--skin-field-opacity",
    String(Math.min(1, Math.max(0, fieldOpacity))),
  );
  root.style.setProperty(
    "--skin-field-bg",
    `rgb(from var(--skin-bg) r g b / var(--skin-field-opacity))`,
  );
  root.style.setProperty("--skin-field-fg", skin.tokens.fg);
  root.style.setProperty(
    "--skin-field-border",
    `color-mix(in srgb, var(--skin-muted) 35%, transparent)`,
  );

  const fit = backgroundFitStyles(skin.backgroundFit);
  root.style.setProperty("--skin-bg-repeat", fit.repeat);
  root.style.setProperty("--skin-bg-position", fit.position);
  root.style.setProperty("--skin-bg-size", fit.size);

  setFontFace(DISPLAY_FONT_STYLE_ID, DISPLAY_FAMILY, skin.fonts?.displayDataUrl);
  setFontFace(BODY_FONT_STYLE_ID, BODY_FAMILY, skin.fonts?.bodyDataUrl);

  const displayStack = skin.fonts?.displayDataUrl
    ? `"${DISPLAY_FAMILY}", ${skin.tokens.fontDisplay}`
    : skin.tokens.fontDisplay;
  const bodyStack = skin.fonts?.bodyDataUrl
    ? `"${BODY_FAMILY}", ${skin.tokens.fontBody}`
    : skin.tokens.fontBody;
  root.style.setProperty("--skin-font-display", displayStack);
  root.style.setProperty("--skin-font-body", bodyStack);

  if (skin.images?.tilingBackground) {
    root.style.setProperty(
      "--skin-bg-image",
      `url(${skin.images.tilingBackground})`,
    );
  } else {
    root.style.removeProperty("--skin-bg-image");
  }

  // Legacy header/footer image fields were removed; clear any leftover vars.
  root.style.removeProperty("--skin-header-image");
  root.style.removeProperty("--skin-footer-image");

  // Freeform custom assets — exposed as --skin-asset-<key> for use in customCss.
  // Asset keys are arbitrary per skin, so clear whatever the previous skin set
  // before applying this one's.
  for (const name of previousAssetVarNames) {
    root.style.removeProperty(name);
  }
  const nextAssetVarNames: string[] = [];
  for (const asset of skin.customAssets ?? []) {
    const key = sanitizeAssetKey(asset.key);
    if (!key) continue;
    const varName = `--skin-asset-${key}`;
    root.style.setProperty(varName, `url(${asset.dataUrl})`);
    nextAssetVarNames.push(varName);
  }
  previousAssetVarNames = nextAssetVarNames;

  // Raw CSS escape hatch — injected as-is, author is responsible for its content.
  let customCssEl = document.getElementById(CUSTOM_CSS_STYLE_ID) as HTMLStyleElement | null;
  if (skin.customCss) {
    if (!customCssEl) {
      customCssEl = document.createElement("style");
      customCssEl.id = CUSTOM_CSS_STYLE_ID;
      document.head.appendChild(customCssEl);
    }
    customCssEl.textContent = skin.customCss;
  } else {
    customCssEl?.remove();
  }

  // Read by panelStyle recipe CSS, e.g. [data-panel-style="sticky"] .pack-section { ... }
  root.setAttribute("data-panel-style", skin.panelStyle ?? "flat");
}

