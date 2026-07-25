import type { Skin } from "../domain/types";

/** Skin ids that are always upserted on launch and cannot be deleted. */
export const BUILT_IN_SKIN_IDS = new Set(["hfl-minimal", "ocean"]);

export function isBuiltInSkin(id: string): boolean {
  return BUILT_IN_SKIN_IDS.has(id);
}

const OCEAN_WAVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" fill="#0c2f45"/><path fill="#134a66" opacity="0.55" d="M0 118 C40 98 80 138 120 118 S200 98 240 118 S300 138 320 118 V200 H0 Z"/><path fill="#1a5f7a" opacity="0.35" d="M0 142 C50 128 90 156 140 142 S220 128 270 142 S310 156 320 142 V200 H0 Z"/><path fill="#0a2536" opacity="0.25" d="M0 168 C60 158 100 178 160 168 S260 158 320 168 V200 H0 Z"/></svg>`;

const OCEAN_WAVE_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(OCEAN_WAVE_SVG)}`;

/** Built-in Ocean skin — refreshed on every app launch. */
export const OCEAN_SKIN: Skin = {
  id: "ocean",
  name: "Ocean",
  version: "2.1.1",
  tokens: {
    bg: "#0c2f45",
    fg: "#e7f3f8",
    accent: "#3db8c9",
    muted: "#7aa8b8",
    fontDisplay: '"Libre Baskerville", Georgia, serif',
    fontBody: '"Source Sans 3", system-ui, sans-serif',
  },
  images: {
    tilingBackground: OCEAN_WAVE_DATA_URL,
  },
  backgroundFit: "cover",
  opacity: {
    surface: 0.84,
    chrome: 0.9,
    field: 0.92,
  },
  panelStyle: "card",
  customCss: `
@import url("https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@400;600&display=swap");

:root {
  --skin-entry-date-size: 1.1rem;
  --skin-entry-date-weight: 700;
  --skin-entry-date-family: var(--skin-font-display);
  --skin-field-bg: rgb(from var(--skin-bg) r g b / var(--skin-field-opacity));
  --skin-field-fg: var(--skin-fg);
  --skin-field-border: color-mix(in srgb, var(--skin-fg) 18%, transparent);
}

body {
  caret-color: var(--skin-accent);
}

input:focus,
textarea:focus,
select:focus {
  outline: 2px solid var(--skin-accent);
  border-color: var(--skin-accent);
}

.free-write,
.pack-section {
  backdrop-filter: blur(6px);
  border-color: color-mix(in srgb, var(--skin-fg) 14%, transparent);
}

.pack-tabs__tab {
  background: color-mix(in srgb, var(--skin-bg) 70%, #1a5f7a);
  color: var(--skin-fg);
}

.pack-tabs__tab--active {
  background: var(--skin-accent);
  color: #062433;
}

.entry-save-button {
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.9rem;
}

.bottom-nav__link--active {
  background: color-mix(in srgb, var(--skin-accent) 18%, transparent);
}
`.trim(),
};
