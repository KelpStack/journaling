import type { Skin } from "../domain/types";
import { HFL_PACK } from "./builtInPacks";

export { HFL_PACK };

/** Built-in journal skin — refreshed from this constant on every app launch. */
export const HFL_SKIN: Skin = {
  id: "hfl-minimal",
  name: "Minimal",
  version: "2.1.0",
  tokens: {
    bg: "#f7f4ef",
    fg: "#243038",
    accent: "#3d6b7a",
    muted: "#7a8f9a",
    fontDisplay: '"Fraunces", Georgia, "Times New Roman", serif',
    fontBody: '"Source Serif 4", Georgia, "Times New Roman", serif',
  },
  backgroundFit: "tile",
  opacity: {
    surface: 0.97,
    chrome: 0.96,
    field: 0.98,
  },
  panelStyle: "paper",
  customCss: `
@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap");

:root {
  --skin-paper-line: 1.6rem;
  --skin-entry-date-size: 1.15rem;
  --skin-entry-date-weight: 600;
  --skin-entry-date-family: var(--skin-font-display);
  --skin-field-bg: rgb(from var(--skin-bg) r g b / var(--skin-field-opacity));
  --skin-field-fg: var(--skin-fg);
  --skin-field-border: color-mix(in srgb, var(--skin-muted) 32%, transparent);
}

.entry-date-nav__arrow {
  border-radius: 0.2rem;
  background: color-mix(in srgb, var(--skin-bg) 88%, var(--skin-fg));
}

.pack-tabs__tab {
  border-radius: 0.2rem;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 600;
}

.bottom-nav {
  border-top-color: color-mix(in srgb, var(--skin-muted) 28%, transparent);
}

.entry-save-button {
  border-radius: 0.35rem;
}
`.trim(),
};
