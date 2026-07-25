# Entries Table View Implementation Plan

> **For agentic workers:** Use executing-plans or implement inline. Steps use checkbox syntax.

**Goal:** Replace Search with a dense “View & search entries” table (full answered prompts, pack buttons, advanced filters collapsed).

**Architecture:** Keep `/search`. Add a pure `buildEntryAnswerLines` helper for the right column. `SearchPage` loads packs + runs `searchEntries` live, joins full `DailyEntry` rows for rendering.

**Spec:** `docs/superpowers/specs/2026-07-25-entries-table-view-design.md`

## Tasks

### Task 1: Row content helper + tests
- Create `src/domain/entryTableRows.ts` + `.test.ts`
- `formatEntryTableDate(journalDate)` → locale short numeric
- `buildEntryAnswerLines(entry, packs)` → `{ label, value }[]` skipping empty answers; include free-write

### Task 2: Rewrite SearchPage UI + CSS + Calendar label
- Rewrite `SearchPage.tsx`: title, keyword, pack buttons, advanced disclosure, dense table
- Live search via `useEffect` on filters; join entries by id
- CSS in `global.css`; Calendar button → “View & search entries”

### Task 3: Verify
- `npm test` + `npm run build`
- Commit
