# Entries table view (View & search)

**Date:** 2026-07-25  
**Status:** Approved for implementation planning  
**Scope:** Replace the Search page with a dense entries table that doubles as search/filter.

## Problem

Calendar + Search today make it hard to scan many journal days at once. Search is form-heavy and returns snippets, not full answered prompts.

## Goals

- Replace `/search` with **View & search entries**: a minimalist two-column table of entries.
- Default filter = **everything** (all stored entries, newest first).
- Pack filters as **buttons** (not a dropdown); keyword search always visible.
- Other current filters remain under a collapsed **Advanced filters** section.
- Right column shows **full** answered prompts (no truncation); skip unanswered fields.
- Dense layout so many days fit on screen.
- Calendar CTA opens this page with matching label.

## Non-goals

- Virtualized infinite scroll (defer until performance requires it).
- A second separate Search page.
- Showing unanswered prompts.
- Changing entry edit UX beyond deep-linking into a day.

## Placement

- Route stays `/search` (rename in UI only).
- Page title: **View & search entries**.
- Calendar footer button label: **View & search entries** (still links to `/search`).
- Remove/replace the old Search page chrome; keep the same React route wiring in `App`.

## Layout

### Always visible

1. Page title  
2. Keyword text input  
3. Pack filter buttons: `All` (default selected) + one button per installed pack (by pack name). Selecting a pack filters to entries that include that pack (same semantics as today’s `packId` search filter). `All` clears pack filter.

### Advanced filters (collapsed by default)

Same capabilities as current SearchPage, tucked behind a disclosure control labeled **Advanced filters**:

- Date from / date to  
- Completion: all | completed | draft  
- Yes/no field + yes/no value  
- Number field + min / max  

Filters apply when values change (live), including Advanced once opened/edited.

### Results table

Two columns, dense padding, hairline row separators:

| Left | Right |
|------|--------|
| Entry journal date, locale short numeric format (e.g. `toLocaleDateString` with day/month/year), column only as wide as needed + small padding | Answered fields for that day |

**Right column rules:**

- For each answer with meaningful content, show field **label** and **value** in full (no ellipsis truncation).
- Skip null/empty/unchecked-only checklist answers.
- Include free-write body if non-empty (label: Free write).
- Resolve labels from installed packs via `fieldRef` → pack field; if pack/field missing, fall back to field id or raw ref.
- Format values: text as-is; yes/no as Yes/No; number as number (+ unit if on field); checklist as comma-separated checked option labels (or ids if labels unknown).

**Interaction:**

- Entire row is a link/button to `/entry/{date}`.
- If keyword search attributed a matching `fieldRef`, append `?field=` as today.

**Ordering:** newest journal date first.

**Empty states:**

- No entries in DB: “No entries yet.”  
- Entries exist but filters match none: “No matches.”

## Data & filtering

- Source: stored `DailyEntry` rows for `profileId` (empty drafts are already not persisted).
- Default load: all entries, then apply filters client-side and/or via existing `searchEntries` helpers.
- Prefer reusing `searchIndex` / `searchEntries` for filter predicates so behavior stays aligned with today’s search.
- For the table body, load full entry records (or join search hits → entries) so answers and body can be rendered completely—not search snippets alone.
- Pack list for buttons: `listPacks()`.

## Implementation sketch (non-binding)

- Rewrite `src/ui/more/SearchPage.tsx` (or rename file to `EntriesPage.tsx` and update imports) to the table UI.
- Shared CSS in `global.css` for dense table + pack chip buttons + advanced disclosure.
- Update Calendar link copy.
- Tests: filter “all” returns entries; pack button filters; unanswered fields omitted from row model; date formatting helper if extracted.

## Out of scope follow-ups

- Windowing/virtualization for very large journals.
- Export CSV from the table.
- Inline editing in the table.
