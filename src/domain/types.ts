export type ProfileId = string;
export type JournalDate = string; // YYYY-MM-DD
export type FieldType = "longText" | "shortText" | "date" | "number" | "yesNo" | "checklist";
export type PromptMode = "fixed" | "random";
export type BackgroundFit = "tile" | "center" | "cover";
/**
 * Controls which fixed CSS "recipe" panels/cards render with. Colors, fonts,
 * and opacity stay fully custom per skin; panelStyle only picks a shape
 * treatment (radius/shadow/border) from a small built-in set, so a skin can
 * look like a sticky note or ruled paper without any freeform CSS.
 */
export type SurfaceStyle = "flat" | "card" | "sticky" | "paper";

export interface ChecklistOption {
  id: string;
  label: string;
}

export interface PackField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  unit?: string;
  min?: number;
  max?: number;
  stats?: boolean;
  preferredAnswer?: "yes" | "no";
  /** Fixed checklist items (checklist fields only). */
  options?: ChecklistOption[];
}

export interface PackSection {
  id: string;
  title: string;
  promptMode: PromptMode;
  fields: PackField[];
  pool?: PackField[];
  drawCount?: number;
}

export interface ContentPack {
  id: string;
  name: string;
  version: string;
  description?: string;
  sections: PackSection[];
  /** @deprecated read via normalizePack only */
  promptMode?: PromptMode;
  /** @deprecated */
  fields?: PackField[];
  /** @deprecated */
  pool?: PackField[];
  /** @deprecated */
  drawCount?: number;
  hideFreeWrite?: boolean;
}

export interface SkinImages {
  /** Background image (placement via Skin.backgroundFit) */
  tilingBackground?: string;
}

/**
 * A user-named image asset. Not rendered anywhere by the app itself — it's
 * exposed as `--skin-asset-<key>` (url(...)) for use in Skin.customCss.
 * Lets a skin author add a header banner, footer image, corner sticker,
 * etc. without the app needing a dedicated field/renderer for each idea.
 */
export interface CustomAsset {
  /** CSS-var-safe name: letters, numbers, hyphens, underscores only. */
  key: string;
  dataUrl: string;
}

export interface SkinFonts {
  /** Custom font file as data URL */
  displayDataUrl?: string;
  bodyDataUrl?: string;
}

export interface SkinOpacity {
  /** Panel/card opacity 0–1 */
  surface: number;
  /** Bottom nav / chrome opacity 0–1 */
  chrome: number;
  /** Text inputs / textareas opacity 0–1 */
  field?: number;
}

export interface Skin {
  id: string;
  name: string;
  version: string;
  tokens: {
    bg: string;
    fg: string;
    accent: string;
    muted: string;
    fontDisplay: string;
    fontBody: string;
  };
  images?: SkinImages;
  /** How to place tilingBackground. Default: tile */
  backgroundFit?: BackgroundFit;
  opacity?: SkinOpacity;
  fonts?: SkinFonts;
  /** Shape treatment for panels/cards. Default: flat */
  panelStyle?: SurfaceStyle;
  /** Freeform image assets, exposed as CSS vars for use in customCss. */
  customAssets?: CustomAsset[];
  /**
   * Raw CSS, injected as-is into a <style> tag whenever this skin is active.
   * Escape hatch for anything the structured fields above don't cover —
   * available vars: --skin-bg / -fg / -accent / -muted, --skin-font-display,
   * --skin-font-body, --skin-surface-opacity, --skin-chrome-opacity,
   * --skin-field-opacity, --skin-field-bg / -fg / -border, and
   * --skin-asset-<key> for each entry in customAssets. Also selectable via
   * [data-panel-style="..."] on <html>.
   */
  customCss?: string;
}

/** Checked state keyed by checklist option id. */
export type ChecklistAnswer = Record<string, boolean>;

export type AnswerValue = string | number | boolean | ChecklistAnswer;

export interface FieldAnswer {
  fieldRef: string; // packId:fieldId
  value: AnswerValue | null;
}

/** packId -> sectionId -> drawn field ids */
export type PackPromptDraw = Record<string, string[]>;

export interface DailyEntry {
  id: string; // `${profileId}:${date}`
  profileId: ProfileId;
  date: JournalDate;
  body: string;
  answers: FieldAnswer[];
  completedByPack: Record<string, string>; // packId -> ISO completedAt
  completedAt?: string;
  skinId: string;
  contentPackIds: string[];
  promptDraw: Record<string, PackPromptDraw>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProfileSettings {
  profileId: ProfileId;
  activeSkinId: string;
  activeContentPackIds: string[];
  backdateRepairsStreak: boolean;
  requireFreeWrite: boolean;
  /** When false, hide the free-write box (unless a pack forces hide anyway). Default true. */
  showFreeWrite?: boolean;
  /**
   * When true and multiple packs are active, entry-page pack tabs show only the
   * focused pack. Default true. Set false to keep all packs visible and scroll.
   */
  multiPackShowOneAtATime?: boolean;
  /** Entry heading date style. Default: full (e.g. Monday, 23 July 2026). */
  entryDateFormat?: "full" | "short" | "numeric";
  backupCadence: "off" | "daily" | "weekly";
  backupTimeLocal: string; // HH:mm
  backupOnEdit: boolean;
  lastBackupAt?: string;
  collapsedPackIds?: string[];
  lastToastedStreakMilestone?: number;
  /** When true, the first-launch welcome guide is not shown again. */
  hideWelcomeGuide?: boolean;
}
