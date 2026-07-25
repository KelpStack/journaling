# Pack sections (mixed prompt modes)

**Date:** 2026-07-24  
**Status:** Approved for implementation planning  
**Scope:** Named sections inside a content pack (each with its own fixed/random mode), collapsible section UI, HFL rebuild, Dive Log field tweaks (`date` field type + shortText), Calendar search button.

## Problem

A pack today is entirely `fixed` or entirely `random`. That blocks useful layouts such as Homework for Life with one random reflection plus fixed short check-ins (mood, weather). Long fixed packs (Dive Log) are also harder to scan without grouping.

## Goals

- Allow **more than one prompt mode per pack** via ordered **sections**.
- Each section is **collapsible** on the entry page; always starts **expanded** (no persisted section collapse).
- Rebuild **HFL** into two sections (random + fixed short check-in).
- Dive Log: **Dive date** uses a new `date` field type; other former longText fields except Notes → **shortText**.
- Calendar “Search entries” becomes a **button**, not a text link.
- Add field type **`date`** (ISO `YYYY-MM-DD`, native date input).

## Non-goals

- Persisting section collapse in settings.
- Full migration tooling for old zip/import formats beyond a thin read-time normalize.
- Changing free-write / pack-level collapse behavior.
- Multi-draw UI beyond existing `drawCount` on a random section.
- A separate `time` field type (Dive time stays `shortText` for now).
- Date-based search filters / stats (dates remain searchable as plain text in the index).

## Data model

### Section

```ts
interface PackSection {
  id: string;
  title: string;
  promptMode: "fixed" | "random";
  /** Fixed: fields shown. Random: usually same as `pool` (editor keeps them in sync); display uses drawn ids from pool. */
  fields: PackField[];
  /** Random: draw from this pool (falls back to `fields` if omitted). */
  pool?: PackField[];
  /** Random: how many prompts to draw (default 1). */
  drawCount?: number;
}
```

### Content pack

- Source of truth: `sections: PackSection[]` (ordered).
- Top-level `promptMode` / `fields` / `pool` / `drawCount` are **not** written by new exports.
- `normalizePack(pack)` at read time: if `sections` is missing/empty but legacy top-level fields exist, wrap them into one section (`id: "main"`, title = pack name or `"Prompts"`). Prefer normalize because it is cheaper than breaking any custom packs already in IndexedDB.

### Prompt draw

- `DailyEntry.promptDraw[packId]` becomes `Record<sectionId, string[]>` (drawn field ids per random section).
- Fixed sections do not need draw entries.
- `ensurePromptDraw` / `redrawPromptDraw` operate **per section**.
- When reading an entry that still has the legacy shape `promptDraw[packId]: string[]`, treat it as draw for the pack’s first random section (or sole section) so existing HFL entries keep their drawn prompt.

### Field types (additive)

- New `FieldType`: `"date"`.
- Answer value: `string` in `YYYY-MM-DD` form (same convention as `JournalDate`).
- Entry UI: `<input type="date">` styled like other field inputs.
- Answered = non-empty valid date string.
- No stats for date fields.
- Pack editor: include `date` in the type dropdown.

### Field identity

- Unchanged: answers use `fieldRef = `${packId}:${fieldId}``.
- Field ids must remain unique **within a pack** across sections (editor validates).

## Built-in content

### Homework for Life (v3)

1. **Reflection** — `random`, `drawCount: 1`, pool = current HFL longText prompts.
2. **Check-in** — `fixed`, shortText fields:
   - `mood` — Mood
   - `weather` — Weather  

Required flags: the drawn reflection prompt is **required**; Mood and Weather are **optional** so a skipped check-in does not block completion.

### Dive Log (v2.1)

- Single fixed section (e.g. title “Dive”).
- `date` → **`date`** field type (required).
- `time`, `site`, `buddies` → `shortText`.
- `notes` stays `longText`.
- Number / yesNo fields unchanged.
- Still overwritten on launch via `ensureSeeded`.

## Entry UI

- Pack shell unchanged (existing pack collapse via settings).
- Inside pack body: render each section as a header (title + chevron) + field list.
- Section expand/collapse: **local React state only**; reset to expanded whenever the entry/pack view mounts or the day changes.
- Random section: redraw control on the first drawn field, scoped to that section.
- shortText: single-line input (already supported).
- date: native date input; empty until the user picks a day.

## Pack editor

- Replace pack-level mode UI with an ordered list of sections.
- Per section: title, mode, fields; if random, pool + draw count.
- Actions: add / rename / reorder / delete section.
- Save writes `sections` only (normalized shape).

## Plumbing touchpoints

All consumers go through normalize + section-aware helpers:

| Area | Change |
|------|--------|
| `fieldsForPackOnDay` / merge | Return fields from all sections (respecting each section’s draw) |
| `randomDraw` | Ensure/redraw per section |
| `entrySnapshot` | Keep promptDraw coherent per active pack sections |
| `completion` | Required fields across all visible section fields |
| Vault export | Iterate sections when listing fields for markdown |
| Search index | Unchanged answer shape |
| Seed / built-ins | Rewrite HFL + Dive Log constants and sample JSON/zips |

## Small unrelated UI fix (same ship)

- Calendar: “Search entries” uses a button control (secondary/action styling consistent with the app), linking to `/search`.

## Testing

- `normalizePack` wraps legacy packs into one section.
- Legacy `promptDraw[packId]: string[]` maps onto the first random section.
- Multi-section: random draw + fixed fields both appear; redraw only changes the random section’s ids.
- Completion: required random field gates pack completion; optional check-in does not.
- Built-in shape smoke: HFL has two sections; Dive Log uses `date` for dive date and shortText for time/site/buddies.
- Existing repo tests updated for new pack shape / promptDraw type.

## Out of scope follow-ups

- Grouping Dive Log into multiple sections.
- Persisted section collapse.
- Section-level stats grouping in More/search filters.
