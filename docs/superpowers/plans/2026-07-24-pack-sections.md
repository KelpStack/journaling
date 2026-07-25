# Pack Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ordered pack sections with per-section fixed/random modes, a `date` field type, rebuild HFL/Dive Log, collapsible section UI, and a Calendar search button.

**Architecture:** Introduce `PackSection` as the pack body; read all packs through `normalizePack()`. Change `promptDraw[packId]` to `Record<sectionId, string[]>` with a legacy-array shim. Domain helpers (`fieldsForPackOnDay`, `ensurePromptDraw`, completion, snapshot) become section-aware; UI renders collapsible sections inside each pack panel.

**Tech Stack:** Existing Vite + React 19 + TypeScript + Dexie + Vitest. Spec: `docs/superpowers/specs/2026-07-24-pack-sections-design.md`.

## Global Constraints

- Section collapse is **local UI state only** — always start expanded; do not persist
- New exports write `sections` only (no top-level `promptMode`/`fields`/`pool`/`drawCount`)
- `normalizePack()` must accept legacy packs still in IndexedDB
- Legacy `promptDraw[packId]: string[]` maps to the first random section (else sole section)
- Field ids unique across all sections in a pack
- HFL check-in Mood/Weather are **optional**; reflection prompt **required**
- Dive Log: `date` field type for Dive date; `time`/`site`/`buddies` → shortText; Notes → longText
- No separate `time` field type; no date search filters/stats
- Calendar Search is a **button** linking to `/search`

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/domain/types.ts` | `PackSection`, `ContentPack.sections`, `date` FieldType, `promptDraw` type |
| `src/domain/normalizePack.ts` | Legacy → sections; flatten helpers; promptDraw normalize |
| `src/domain/mergePacks.ts` | Section-aware field lists for a day |
| `src/domain/randomDraw.ts` | Ensure/redraw per section |
| `src/domain/completion.ts` | Required fields across sections; `date` answered |
| `src/domain/entrySnapshot.ts` | Coherent per-section draws |
| `src/packs/builtInPacks.ts` | HFL v3 + Dive Log v2.1 section shapes |
| `src/packs/diveLogSample/content/dive-log.json` | Sample zip source |
| `src/ui/today/PackSection.tsx` | Collapsible sections + date input |
| `src/ui/today/EntryPage.tsx` | Redraw scoped to section |
| `src/ui/packs/ContentPackEditor.tsx` | Section editor UX |
| `src/backup/vaultExport.ts` | Iterate normalized sections |
| `src/ui/calendar/CalendarPage.tsx` + `global.css` | Search button |
| Tests under `src/domain/*.test.ts`, `src/db/seed.test.ts`, etc. |

---

### Task 1: Types, `date` field, `normalizePack`

**Files:**
- Modify: `src/domain/types.ts`
- Create: `src/domain/normalizePack.ts`
- Create: `src/domain/normalizePack.test.ts`
- Modify: `src/domain/completion.ts` (date answering only in this task if easy; otherwise Task 3)
- Modify: `src/domain/completion.test.ts`

**Interfaces:**
- Produces:
  - `PackSection` as in the spec
  - `ContentPack` with required `sections: PackSection[]` and **optional** legacy `promptMode?`, `fields?`, `pool?`, `drawCount?` for reads
  - `DailyEntry.promptDraw: Record<string, PackPromptDraw>` where `PackPromptDraw = Record<string, string[]>`
  - `FieldType` includes `"date"`
  - `normalizePack(pack: ContentPack): ContentPack` — always returns pack with non-empty `sections`, strips nothing required for runtime
  - `normalizePackPromptDraw(pack: ContentPack, raw: unknown): PackPromptDraw`
  - `allPackFields(pack: ContentPack): PackField[]` — fields from every section (pool∪fields for uniqueness checks)

- [ ] **Step 1: Write failing normalize tests**

```ts
import { describe, expect, it } from "vitest";
import { normalizePack, normalizePackPromptDraw } from "./normalizePack";
import type { ContentPack } from "./types";

const legacy: ContentPack = {
  id: "hfl",
  name: "Homework for Life",
  version: "2.0.0",
  promptMode: "random",
  drawCount: 1,
  fields: [{ id: "surprise", label: "Surprise", type: "longText", required: true }],
  pool: [{ id: "surprise", label: "Surprise", type: "longText", required: true }],
  sections: [],
};

describe("normalizePack", () => {
  it("wraps legacy top-level fields into one section", () => {
    const n = normalizePack(legacy);
    expect(n.sections).toHaveLength(1);
    expect(n.sections[0]).toMatchObject({
      id: "main",
      promptMode: "random",
      drawCount: 1,
    });
    expect(n.sections[0]?.fields[0]?.id).toBe("surprise");
  });

  it("passes through existing sections", () => {
    const modern: ContentPack = {
      id: "x",
      name: "X",
      version: "1",
      sections: [
        {
          id: "a",
          title: "A",
          promptMode: "fixed",
          fields: [{ id: "m", label: "Mood", type: "shortText", required: false }],
        },
      ],
    };
    expect(normalizePack(modern).sections).toHaveLength(1);
    expect(normalizePack(modern).sections[0]?.id).toBe("a");
  });
});

describe("normalizePackPromptDraw", () => {
  it("maps legacy string[] onto the first random section", () => {
    const pack = normalizePack(legacy);
    const draw = normalizePackPromptDraw(pack, ["surprise"]);
    expect(draw).toEqual({ main: ["surprise"] });
  });

  it("passes through section-keyed draws", () => {
    const pack = normalizePack(legacy);
    expect(normalizePackPromptDraw(pack, { main: ["surprise"] })).toEqual({
      main: ["surprise"],
    });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/domain/normalizePack.test.ts`
Expected: FAIL (module/types missing)

- [ ] **Step 3: Update types**

In `src/domain/types.ts`:

```ts
export type FieldType =
  | "longText"
  | "shortText"
  | "date"
  | "number"
  | "yesNo"
  | "checklist";

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

/** packId -> sectionId -> drawn field ids */
export type PackPromptDraw = Record<string, string[]>;

export interface DailyEntry {
  // ...
  promptDraw: Record<string, PackPromptDraw>;
  // ...
}
```

- [ ] **Step 4: Implement `normalizePack.ts`**

```ts
import type { ContentPack, PackField, PackPromptDraw, PackSection } from "./types";

export function normalizePack(pack: ContentPack): ContentPack {
  if (pack.sections && pack.sections.length > 0) {
    return { ...pack, sections: pack.sections };
  }
  const fields = pack.fields ?? [];
  const section: PackSection = {
    id: "main",
    title: pack.name || "Prompts",
    promptMode: pack.promptMode ?? "fixed",
    fields,
    ...(pack.pool ? { pool: pack.pool } : {}),
    ...(pack.drawCount != null ? { drawCount: pack.drawCount } : {}),
  };
  return { ...pack, sections: [section] };
}

export function allPackFields(pack: ContentPack): PackField[] {
  const n = normalizePack(pack);
  const out: PackField[] = [];
  const seen = new Set<string>();
  for (const section of n.sections) {
    const list =
      section.promptMode === "random"
        ? section.pool ?? section.fields
        : section.fields;
    for (const field of list) {
      if (seen.has(field.id)) continue;
      seen.add(field.id);
      out.push(field);
    }
    for (const field of section.fields) {
      if (seen.has(field.id)) continue;
      seen.add(field.id);
      out.push(field);
    }
  }
  return out;
}

export function normalizePackPromptDraw(
  pack: ContentPack,
  raw: unknown,
): PackPromptDraw {
  const n = normalizePack(pack);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const out: PackPromptDraw = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
        out[key] = value as string[];
      }
    }
    return out;
  }
  if (Array.isArray(raw) && raw.every((v) => typeof v === "string")) {
    const target =
      n.sections.find((s) => s.promptMode === "random") ?? n.sections[0];
    if (!target) return {};
    return { [target.id]: raw as string[] };
  }
  return {};
}
```

- [ ] **Step 5: Add `date` to `isAnswered`**

In `completion.ts`, treat `date` like shortText but require `isJournalDate` when non-empty:

```ts
import { isJournalDate } from "./dates";
// in isAnswered:
if (type === "longText" || type === "shortText") {
  return String(value).trim().length > 0;
}
if (type === "date") {
  return typeof value === "string" && isJournalDate(value);
}
```

Add tests in `completion.test.ts` for `isAnswered("2026-07-20", "date")` true and invalid false.

- [ ] **Step 6: Run tests — expect PASS**

Run: `npx vitest run src/domain/normalizePack.test.ts src/domain/completion.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/domain/types.ts src/domain/normalizePack.ts src/domain/normalizePack.test.ts src/domain/completion.ts src/domain/completion.test.ts
git commit -m "feat: pack sections types, normalizePack, and date field answering"
```

---

### Task 2: Section-aware draw + field lists + snapshot

**Files:**
- Modify: `src/domain/mergePacks.ts`
- Modify: `src/domain/randomDraw.ts`
- Modify: `src/domain/randomDraw.test.ts`
- Modify: `src/domain/entrySnapshot.ts`
- Modify: `src/domain/entrySnapshot.test.ts`
- Modify: `src/domain/completion.ts` (use section field lists)
- Modify: any test fixtures that set `promptMode`/`fields` without `sections` or use `string[]` promptDraw

**Interfaces:**
- Consumes: `normalizePack`, `normalizePackPromptDraw`
- Produces:
  - `fieldsForSectionOnDay(section, drawnIds?: string[]): PackField[]`
  - `fieldsForPackOnDay(pack, packDraw?: PackPromptDraw): PackField[]`
  - `ensurePromptDraw(entry, pack, rng?)` → updates `promptDraw[pack.id]` as `PackPromptDraw`
  - `redrawPromptDraw(entry, pack, sectionId, rng?)` → redraw one section only

- [ ] **Step 1: Rewrite failing randomDraw tests for sections**

Update `src/domain/randomDraw.test.ts` so packs use `sections` and `promptDraw.hfl` / `promptDraw.prompts` are objects keyed by section id. Cover: ensure fills missing random section; redraw only that section; fixed section returns all field ids without writing draw.

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/domain/randomDraw.test.ts`

- [ ] **Step 3: Implement merge + draw**

`mergePacks.ts`:

```ts
export function fieldsForSectionOnDay(
  section: PackSection,
  drawnFieldIds?: string[],
): PackField[] {
  if (section.promptMode === "random") {
    const pool = section.pool ?? section.fields;
    const ids = drawnFieldIds ?? [];
    return ids
      .map((id) => pool.find((f) => f.id === id))
      .filter((f): f is PackField => !!f);
  }
  return section.fields;
}

export function fieldsForPackOnDay(
  pack: ContentPack,
  packDraw?: PackPromptDraw,
): PackField[] {
  const n = normalizePack(pack);
  const draw = packDraw ?? {};
  return n.sections.flatMap((section) =>
    fieldsForSectionOnDay(section, draw[section.id]),
  );
}
```

`randomDraw.ts`: loop `normalizePack(pack).sections`; for each random section, ensure `promptDraw[pack.id][section.id]`; `redrawPromptDraw(entry, pack, sectionId)` only redraws that section and clears answers for previous field refs in that section.

`entrySnapshot.ts`: when copying existing draw, run `normalizePackPromptDraw(pack, entry.promptDraw[packId])`; then `ensurePromptDraw` for each active pack.

`completion.packRequirementsMet`: use `fieldsForPackOnDay(pack, entry.promptDraw[pack.id])` after normalizing the draw on the entry (or normalize inside helper).

- [ ] **Step 4: Fix compile errors in other tests**

Grep for `promptMode:` and `promptDraw:` fixtures; add `sections: []` or full sections and object draws as needed so `tsc` / tests pass. Prefer putting real `sections` on fixtures instead of relying on legacy alone when easy.

- [ ] **Step 5: Run domain tests**

Run: `npx vitest run src/domain`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/domain
git commit -m "feat: section-aware prompt draw, field merge, and snapshots"
```

---

### Task 3: Rebuild built-in packs + sample JSON

**Files:**
- Modify: `src/packs/builtInPacks.ts`
- Modify: `src/packs/diveLogSample/content/dive-log.json`
- Modify: `src/db/seed.test.ts`
- Run: `npm run build:samples` (updates zips)

**Interfaces:**
- Consumes: `PackSection`, `ContentPack.sections`
- Produces: `HFL_PACK` v3, `DIVE_LOG_PACK` v2.1

- [ ] **Step 1: Write / update seed smoke tests**

In `src/db/seed.test.ts` (or `builtInPacks` assertions):

```ts
it("HFL has reflection + check-in sections", () => {
  expect(HFL_PACK.version).toBe("3.0.0");
  expect(HFL_PACK.sections).toHaveLength(2);
  expect(HFL_PACK.sections[0]).toMatchObject({
    id: "reflection",
    promptMode: "random",
    drawCount: 1,
  });
  expect(HFL_PACK.sections[1]).toMatchObject({
    id: "check-in",
    promptMode: "fixed",
  });
  expect(HFL_PACK.sections[1]?.fields.map((f) => f.id)).toEqual([
    "mood",
    "weather",
  ]);
});

it("Dive Log uses date + shortText fields", () => {
  const fields = DIVE_LOG_PACK.sections[0]?.fields ?? [];
  expect(fields.find((f) => f.id === "date")?.type).toBe("date");
  expect(fields.find((f) => f.id === "time")?.type).toBe("shortText");
  expect(fields.find((f) => f.id === "notes")?.type).toBe("longText");
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Rewrite `HFL_PACK` and `DIVE_LOG_PACK`**

HFL:

```ts
export const HFL_PACK: ContentPack = {
  id: "hfl",
  name: "Homework for Life",
  version: "3.0.0",
  description: "One random reflection plus optional mood and weather check-in.",
  hideFreeWrite: false,
  sections: [
    {
      id: "reflection",
      title: "Reflection",
      promptMode: "random",
      drawCount: 1,
      fields: HFL_PROMPTS,
      pool: HFL_PROMPTS,
    },
    {
      id: "check-in",
      title: "Check-in",
      promptMode: "fixed",
      fields: [
        { id: "mood", label: "Mood", type: "shortText", required: false },
        { id: "weather", label: "Weather", type: "shortText", required: false },
      ],
    },
  ],
};
```

Dive Log: one section `id: "dive"`, title `"Dive"`; update field types per spec; version `"2.1.0"`. Mirror the same JSON in `diveLogSample/content/dive-log.json`.

- [ ] **Step 4: `npm run build:samples`**

- [ ] **Step 5: Run seed + related tests — PASS**

- [ ] **Step 6: Commit**

```bash
git add src/packs/builtInPacks.ts src/packs/diveLogSample src/db/seed.test.ts public/samples
git commit -m "feat: rebuild HFL sections and Dive Log date/shortText fields"
```

---

### Task 4: Entry UI — collapsible sections, date input, section redraw

**Files:**
- Modify: `src/ui/today/PackSection.tsx`
- Modify: `src/ui/today/EntryPage.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `normalizePack`, `fieldsForSectionOnDay`, `redrawPromptDraw(entry, pack, sectionId)`
- Produces: UI with per-section collapse (React state, default expanded); `onRedrawPrompt?: (sectionId: string) => void`

- [ ] **Step 1: Add date input + section chrome in `PackSection`**

Structure:

```tsx
const pack = normalizePack(rawPack);
const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
  () => new Set(),
);
// Reset when pack.id or entry.date changes:
useEffect(() => {
  setCollapsedSections(new Set());
}, [pack.id, entry.date]);

// For each section:
const fields = fieldsForSectionOnDay(section, entry.promptDraw[pack.id]?.[section.id]);
const canRedraw = section.promptMode === "random" && !!onRedrawPrompt;
```

Render section header button toggling `collapsedSections`. Map fields with existing `FieldInput`. Add:

```tsx
if (field.type === "date") {
  return (
    <input
      type="date"
      className="field-input field-input--date"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}
```

Wire redraw: `onRedraw={() => onRedrawPrompt?.(section.id)}`.

- [ ] **Step 2: Update `EntryPage` redraw handler**

```ts
const handleRedraw = (pack: ContentPack, sectionId: string) => {
  updateEntry((current) => redrawPromptDraw(current, pack, sectionId));
};
```

Pass `onRedrawPrompt={(sectionId) => handleRedraw(pack, sectionId)}` for packs that have any random section.

- [ ] **Step 3: CSS**

Add `.pack-section__section`, `.pack-section__section-toggle`, `.field-input--date` mirroring short text input styles.

- [ ] **Step 4: Manual sanity** — `npm run dev`, open HFL: two sections, redraw only changes reflection; Dive Log date picker works.

- [ ] **Step 5: Commit**

```bash
git add src/ui/today/PackSection.tsx src/ui/today/EntryPage.tsx src/styles/global.css
git commit -m "feat: collapsible pack sections, date inputs, and per-section redraw"
```

---

### Task 5: Content pack editor — sections

**Files:**
- Modify: `src/ui/packs/ContentPackEditor.tsx`

**Interfaces:**
- Consumes: `PackSection`, `normalizePack` on `initial`
- Produces: saved packs with `sections` only (omit legacy top-level field keys on save)

- [ ] **Step 1: Change editor state to section list**

On mount: `useState(normalizePack(initial))`.

UI:
- Remove pack-level prompt mode / pool / drawCount controls.
- For each section: title input, mode select, drawCount if random, field list (reuse existing field editor UI).
- Buttons: Add section, Move up/down, Delete section (block delete if only one left).
- When mode is random, keep `pool` synced with `fields` on save (set both to the edited field list) unless you already have separate pool editing — simplest: one field list, assign to both `fields` and `pool` for random sections.

- [ ] **Step 2: Validate on save**

- Every section has non-empty `id` + `title`
- Field ids unique across the whole pack (`allPackFields` / Set)
- `date` in `FIELD_TYPES` array
- Persist:

```ts
const toSave: ContentPack = {
  id: pack.id,
  name: pack.name,
  version: pack.version,
  description: pack.description,
  hideFreeWrite: pack.hideFreeWrite,
  sections: pack.sections.map((section) =>
    section.promptMode === "random"
      ? { ...section, pool: section.fields, fields: section.fields }
      : { ...section, pool: undefined, drawCount: undefined },
  ),
};
```

Do **not** include top-level `promptMode`/`fields`/`pool`/`drawCount`.

- [ ] **Step 3: Smoke in browser** — edit HFL copy / create pack with two sections, save, reopen.

- [ ] **Step 4: Commit**

```bash
git add src/ui/packs/ContentPackEditor.tsx
git commit -m "feat: edit content packs as ordered sections"
```

---

### Task 6: Vault export, calendar button, full test pass, deploy

**Files:**
- Modify: `src/backup/vaultExport.ts` (use `normalizePack` + per-section fields / headings optional)
- Modify: `src/ui/calendar/CalendarPage.tsx`
- Modify: `src/styles/global.css`
- Fix remaining test/compile breakages (`multipack.integration.test.ts`, `vaultExport.test.ts`, pack import if it assumes old shape)

**Interfaces:**
- Vault: for each section, emit `### ${section.title}` then fields (or keep flat field labels — prefer section subheadings for clarity)
- Calendar: replace text link with `<Link className="calendar-search-button" to="/search">Search entries</Link>` styled as a secondary button

- [ ] **Step 1: Update vault export to walk sections**

```ts
const pack = normalizePack(rawPack);
const draw = normalizePackPromptDraw(pack, entry.promptDraw[pack.id]);
for (const section of pack.sections) {
  parts.push(`### ${section.title}`, "");
  for (const field of fieldsForSectionOnDay(section, draw[section.id])) {
    // existing field rendering
  }
}
```

- [ ] **Step 2: Calendar search button styles**

Reuse `.more-button--secondary` look or add `.calendar-search-button` with padding, border-radius, accent border, not underline-only text.

- [ ] **Step 3: Full verification**

```bash
npm test
npm run build
```

Expected: all tests pass; production build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/backup/vaultExport.ts src/ui/calendar/CalendarPage.tsx src/styles/global.css
git commit -m "feat: section-aware vault export and calendar search button"
```

- [ ] **Step 5: Push / deploy** (only if user asked to deploy in the session)

```bash
git push origin main
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| `PackSection` + `sections` source of truth | 1 |
| `normalizePack` legacy shim | 1 |
| `date` field type + answering | 1, 4 |
| `promptDraw` per section + legacy array map | 1–2 |
| Section-aware merge / draw / completion / snapshot | 2 |
| HFL v3 two sections | 3 |
| Dive Log date + shortText | 3 |
| Collapsible sections (start expanded, local state) | 4 |
| Per-section redraw | 4 |
| Pack editor sections | 5 |
| Vault / seed / samples | 3, 6 |
| Calendar search button | 6 |
| Tests listed in spec | 1–3, 6 |

## Self-review notes

- No `time` field type (non-goal).
- Section collapse not persisted (non-goal).
- `redrawPromptDraw` signature gains `sectionId` — all call sites updated in Task 4.
- Editor save omits legacy top-level keys so new zips are clean.
