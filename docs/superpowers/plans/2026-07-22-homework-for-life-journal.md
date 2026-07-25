# Homework-for-Life Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a phone-first offline PWA for one-entry-per-day journaling with mix-and-match skins/content packs, per-pack streaks/stats, search, Obsidian vault + encrypted JSON export, and scheduled/on-edit backups.

**Architecture:** Vite + React + TypeScript PWA; Dexie (IndexedDB) as local source of truth; domain logic pure and unit-tested; packs/skins as importable manifests; `profileId` on all records (always `"local"` in v1); `SyncAdapter` stub only.

**Tech Stack:** Vite, React 19, TypeScript, React Router, Dexie, Vitest, JSZip, Web Crypto, `date-fns`, `vite-plugin-pwa`

**Spec:** `docs/superpowers/specs/2026-07-22-homework-for-life-journal-design.md`

## Global Constraints

- Journal date (`YYYY-MM-DD` local TZ) is the identity for calendar, streaks, stats, and vault filenames — never `createdAt`
- Unanswered fields are omitted from stats (never coerce to `0` or `no`)
- Completion is sticky once earned
- Multiple content packs may be active; one skin active
- Free-write hidden if **any** active pack has `hideFreeWrite: true`
- `requireFreeWrite` defaults false (overall completion only)
- Backdate streak repair defaults **on**
- Vault Markdown export is unencrypted by design; JSON may be passphrase-encrypted
- Dive log ships as `public/samples/dive-log.zip` for import testing; HFL is built-in
- No cloud sync UI in v1

---

## File structure (create as tasks proceed)

```
package.json
vite.config.ts
tsconfig.json
index.html
public/
  samples/dive-log.zip
src/
  main.tsx
  App.tsx
  styles/global.css
  db/
    schema.ts
    database.ts
    entriesRepo.ts
    packsRepo.ts
    skinsRepo.ts
    settingsRepo.ts
    searchIndex.ts
  domain/
    types.ts
    dates.ts
    fieldRef.ts
    completion.ts
    streaks.ts
    randomDraw.ts
    stats.ts
    mergePacks.ts
  packs/
    hflBuiltIn.ts
    manifest.ts
    importZip.ts
    exportZip.ts
    diveLogSample/          # source used to build the sample zip
  backup/
    vaultExport.ts
    vaultImport.ts
    jsonExport.ts
    jsonImport.ts
    crypto.ts
    schedule.ts
    onEditBackup.ts
    download.ts
  sync/
    SyncAdapter.ts
  ui/
    layout/AppShell.tsx
    layout/BottomNav.tsx
    today/EntryPage.tsx
    today/PackSection.tsx
    today/JumpToPack.tsx
    calendar/CalendarPage.tsx
    stats/StatsPage.tsx
    packs/PacksPage.tsx
    packs/ContentPackEditor.tsx
    packs/SkinEditor.tsx
    more/MorePage.tsx
    more/SearchPage.tsx
    skin/applySkin.ts
  test/
    setup.ts
```

---

### Task 1: Scaffold app + Vitest

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/global.css`, `src/test/setup.ts`
- Test: `src/domain/dates.test.ts` (smoke that vitest runs)

**Interfaces:**
- Produces: runnable Vite app; `npm test` via Vitest

- [ ] **Step 1: Scaffold Vite React-TS project in repo root**

Run from `D:\Projects\Journaling` (keep existing `docs/`):

```bash
npm create vite@latest . -- --template react-ts
npm install
npm install react-router-dom dexie date-fns jszip
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom vite-plugin-pwa fake-indexeddb
```

If create-vite refuses non-empty dir, create in a temp folder and move files, preserving `docs/` and `cursor.txt`.

- [ ] **Step 2: Configure Vitest + PWA plugin**

`vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Homework for Life Journal",
        short_name: "HFL Journal",
        start_url: "/",
        display: "standalone",
        background_color: "#0b1f2a",
        theme_color: "#0b1f2a",
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,zip}"],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    globals: true,
  },
});
```

`src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 3: Minimal App shell placeholder**

`src/App.tsx` renders `<h1>HFL Journal</h1>` for now.

- [ ] **Step 4: Commit**

```bash
git init
git add package.json package-lock.json vite.config.ts tsconfig*.json index.html src docs
git commit -m "chore: scaffold Vite React PWA with Vitest"
```

---

### Task 2: Domain types and journal dates

**Files:**
- Create: `src/domain/types.ts`, `src/domain/dates.ts`, `src/domain/fieldRef.ts`
- Test: `src/domain/dates.test.ts`, `src/domain/fieldRef.test.ts`

**Interfaces:**
- Produces: `JournalDate`, `DailyEntry`, `ContentPack`, `Skin`, `ProfileSettings`, `fieldRef()`, `parseFieldRef()`, `todayJournalDate()`, `addJournalDays()`

- [ ] **Step 1: Write failing date tests**

```ts
// src/domain/dates.test.ts
import { describe, it, expect } from "vitest";
import { todayJournalDate, addJournalDays, isJournalDate } from "./dates";

describe("dates", () => {
  it("validates YYYY-MM-DD", () => {
    expect(isJournalDate("2026-07-22")).toBe(true);
    expect(isJournalDate("2026-7-22")).toBe(false);
  });

  it("adds days without UTC shift surprises for fixed local dates", () => {
    expect(addJournalDays("2026-07-22", -1)).toBe("2026-07-21");
    expect(addJournalDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- src/domain/dates.test.ts`  
Expected: FAIL module not found / exports missing

- [ ] **Step 3: Implement types + dates + fieldRef**

```ts
// src/domain/types.ts
export type ProfileId = string;
export type JournalDate = string; // YYYY-MM-DD
export type FieldType = "longText" | "number" | "yesNo";
export type PromptMode = "fixed" | "random";

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
}

export interface ContentPack {
  id: string;
  name: string;
  version: string;
  description?: string;
  promptMode: PromptMode;
  fields: PackField[];
  pool?: PackField[];
  drawCount?: number;
  hideFreeWrite?: boolean;
}

export interface SkinImages {
  tilingBackground?: string; // data URL or blob id
  header?: string;
  footer?: string;
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
}

export type AnswerValue = string | number | boolean;

export interface FieldAnswer {
  fieldRef: string; // packId:fieldId
  value: AnswerValue | null;
}

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
  promptDraw: Record<string, string[]>; // packId -> field ids drawn
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
  backupCadence: "off" | "daily" | "weekly";
  backupTimeLocal: string; // HH:mm
  backupOnEdit: boolean;
  collapsedPackIds?: string[];
}
```

```ts
// src/domain/dates.ts
import { addDays, format, parse } from "date-fns";

const RE = /^\d{4}-\d{2}-\d{2}$/;

export function isJournalDate(s: string): boolean {
  if (!RE.test(s)) return false;
  const d = parse(s, "yyyy-MM-dd", new Date());
  return format(d, "yyyy-MM-dd") === s;
}

export function todayJournalDate(now = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

export function addJournalDays(date: string, delta: number): string {
  const d = parse(date, "yyyy-MM-dd", new Date());
  return format(addDays(d, delta), "yyyy-MM-dd");
}

export function sameLocalCalendarDay(isoTimestamp: string, journalDate: string): boolean {
  return format(new Date(isoTimestamp), "yyyy-MM-dd") === journalDate;
}
```

```ts
// src/domain/fieldRef.ts
export function fieldRef(packId: string, fieldId: string): string {
  return `${packId}:${fieldId}`;
}

export function parseFieldRef(ref: string): { packId: string; fieldId: string } {
  const i = ref.indexOf(":");
  if (i <= 0) throw new Error(`Invalid fieldRef: ${ref}`);
  return { packId: ref.slice(0, i), fieldId: ref.slice(i + 1) };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- src/domain/dates.test.ts src/domain/fieldRef.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/domain
git commit -m "feat: add domain types and journal date helpers"
```

---

### Task 3: Completion logic (sticky, multipack)

**Files:**
- Create: `src/domain/completion.ts`, `src/domain/mergePacks.ts`
- Test: `src/domain/completion.test.ts`

**Interfaces:**
- Consumes: `DailyEntry`, `ContentPack`, `ProfileSettings`
- Produces: `fieldsForPackOnDay()`, `evaluateCompletion()`, `applyStickyCompletion()`

- [ ] **Step 1: Write failing completion tests**

```ts
import { describe, it, expect } from "vitest";
import { applyStickyCompletion, isAnswered } from "./completion";
import type { ContentPack, DailyEntry } from "./types";

const pack: ContentPack = {
  id: "sports",
  name: "Sports",
  version: "1",
  promptMode: "fixed",
  fields: [
    { id: "miles", label: "Miles", type: "number", required: true, stats: true },
    { id: "notes", label: "Notes", type: "longText", required: false },
  ],
};

function baseEntry(over: Partial<DailyEntry> = {}): DailyEntry {
  return {
    id: "local:2026-07-20",
    profileId: "local",
    date: "2026-07-20",
    body: "",
    answers: [],
    completedByPack: {},
    skinId: "minimal",
    contentPackIds: ["sports"],
    promptDraw: {},
    tags: [],
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z",
    ...over,
  };
}

describe("completion", () => {
  it("does not complete pack until required answered", () => {
    const next = applyStickyCompletion(baseEntry(), [pack], {
      requireFreeWrite: false,
      nowIso: "2026-07-22T12:00:00.000Z",
    });
    expect(next.completedByPack.sports).toBeUndefined();
    expect(next.completedAt).toBeUndefined();
  });

  it("sets sticky pack completion when required filled", () => {
    const entry = baseEntry({
      answers: [{ fieldRef: "sports:miles", value: 3 }],
    });
    const next = applyStickyCompletion(entry, [pack], {
      requireFreeWrite: false,
      nowIso: "2026-07-22T12:00:00.000Z",
    });
    expect(next.completedByPack.sports).toBe("2026-07-22T12:00:00.000Z");
  });

  it("keeps sticky completion after clearing required field", () => {
    const entry = baseEntry({
      answers: [{ fieldRef: "sports:miles", value: null }],
      completedByPack: { sports: "2026-07-22T12:00:00.000Z" },
      completedAt: "2026-07-22T12:00:00.000Z",
    });
    const next = applyStickyCompletion(entry, [pack], {
      requireFreeWrite: false,
      nowIso: "2026-07-22T13:00:00.000Z",
    });
    expect(next.completedByPack.sports).toBe("2026-07-22T12:00:00.000Z");
    expect(next.completedAt).toBe("2026-07-22T12:00:00.000Z");
  });

  it("treats null/undefined/empty string as unanswered", () => {
    expect(isAnswered(null, "number")).toBe(false);
    expect(isAnswered("", "longText")).toBe(false);
    expect(isAnswered(0, "number")).toBe(true);
    expect(isAnswered(false, "yesNo")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- src/domain/completion.test.ts`

- [ ] **Step 3: Implement merge + completion**

```ts
// src/domain/mergePacks.ts
import type { ContentPack, PackField } from "./types";
import { fieldRef } from "./fieldRef";

export function shouldHideFreeWrite(packs: ContentPack[]): boolean {
  return packs.some((p) => p.hideFreeWrite);
}

export function fieldsForPackOnDay(
  pack: ContentPack,
  drawnFieldIds?: string[],
): PackField[] {
  if (pack.promptMode === "random") {
    const pool = pack.pool ?? pack.fields;
    const ids = drawnFieldIds ?? [];
    return ids
      .map((id) => pool.find((f) => f.id === id))
      .filter((f): f is PackField => !!f);
  }
  return pack.fields;
}

export function mergedFields(
  packs: ContentPack[],
  promptDraw: Record<string, string[]>,
): { packId: string; field: PackField; ref: string }[] {
  const out: { packId: string; field: PackField; ref: string }[] = [];
  for (const pack of packs) {
    for (const field of fieldsForPackOnDay(pack, promptDraw[pack.id])) {
      out.push({ packId: pack.id, field, ref: fieldRef(pack.id, field.id) });
    }
  }
  return out;
}
```

```ts
// src/domain/completion.ts
import type { AnswerValue, ContentPack, DailyEntry, FieldType } from "./types";
import { fieldsForPackOnDay } from "./mergePacks";
import { fieldRef } from "./fieldRef";

export function isAnswered(value: AnswerValue | null | undefined, type: FieldType): boolean {
  if (value === null || value === undefined) return false;
  if (type === "longText") return String(value).trim().length > 0;
  if (type === "number") return typeof value === "number" && !Number.isNaN(value);
  if (type === "yesNo") return typeof value === "boolean";
  return false;
}

export function packRequirementsMet(
  entry: DailyEntry,
  pack: ContentPack,
): boolean {
  const fields = fieldsForPackOnDay(pack, entry.promptDraw[pack.id]);
  for (const field of fields) {
    if (!field.required) continue;
    const ans = entry.answers.find((a) => a.fieldRef === fieldRef(pack.id, field.id));
    if (!isAnswered(ans?.value ?? null, field.type)) return false;
  }
  return true;
}

export function applyStickyCompletion(
  entry: DailyEntry,
  activePacks: ContentPack[],
  opts: { requireFreeWrite: boolean; nowIso: string },
): DailyEntry {
  const completedByPack = { ...entry.completedByPack };
  for (const pack of activePacks) {
    if (completedByPack[pack.id]) continue;
    if (packRequirementsMet(entry, pack)) {
      completedByPack[pack.id] = opts.nowIso;
    }
  }

  let completedAt = entry.completedAt;
  if (!completedAt) {
    const packsOk = activePacks.every((p) => completedByPack[p.id]);
    const freeOk =
      !opts.requireFreeWrite || entry.body.trim().length > 0 || activePacks.some((p) => p.hideFreeWrite);
    // If free-write hidden by any pack, requireFreeWrite does not apply (spec: hidden ignored)
    const hide = activePacks.some((p) => p.hideFreeWrite);
    const freeSatisfied = hide || !opts.requireFreeWrite || entry.body.trim().length > 0;
    if (packsOk && freeSatisfied) completedAt = opts.nowIso;
  }

  return { ...entry, completedByPack, completedAt };
}
```

Fix the unused `freeOk` if present — keep only `freeSatisfied`.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/domain/completion.ts src/domain/mergePacks.ts src/domain/completion.test.ts
git commit -m "feat: sticky multipack completion rules"
```

---

### Task 4: Streaks (journal date + backdate setting)

**Files:**
- Create: `src/domain/streaks.ts`
- Test: `src/domain/streaks.test.ts`

**Interfaces:**
- Produces: `computeOverallStreak()`, `computePackStreak()`, `StreakResult`

- [ ] **Step 1: Failing tests**

Cover: contiguous journal dates; backdate repair on (completion on Jul 20 written Jul 22 counts); backdate repair off (same case does not count for streak); longest streak.

```ts
import { describe, it, expect } from "vitest";
import { computeOverallStreak, computePackStreak } from "./streaks";
import type { DailyEntry } from "./types";

function e(
  date: string,
  completedAt: string | undefined,
  pack?: Record<string, string>,
): DailyEntry {
  return {
    id: `local:${date}`,
    profileId: "local",
    date,
    body: "x",
    answers: [],
    completedByPack: pack ?? {},
    completedAt,
    skinId: "m",
    contentPackIds: [],
    promptDraw: {},
    tags: [],
    createdAt: completedAt ?? `${date}T12:00:00.000Z`,
    updatedAt: completedAt ?? `${date}T12:00:00.000Z`,
  };
}

describe("streaks", () => {
  it("counts backdated completion when repair on", () => {
    const entries = [
      e("2026-07-20", "2026-07-22T10:00:00.000Z"),
      e("2026-07-21", "2026-07-21T10:00:00.000Z"),
      e("2026-07-22", "2026-07-22T09:00:00.000Z"),
    ];
    const s = computeOverallStreak(entries, {
      asOf: "2026-07-22",
      backdateRepairsStreak: true,
    });
    expect(s.current).toBe(3);
  });

  it("ignores backdated completion for streak when repair off", () => {
    const entries = [
      e("2026-07-20", "2026-07-22T10:00:00.000Z"),
      e("2026-07-21", "2026-07-21T10:00:00.000Z"),
      e("2026-07-22", "2026-07-22T09:00:00.000Z"),
    ];
    const s = computeOverallStreak(entries, {
      asOf: "2026-07-22",
      backdateRepairsStreak: false,
    });
    expect(s.current).toBe(2); // 21 and 22 only
  });
});
```

- [ ] **Step 2: Implement `streaks.ts`**

Logic: filter entries that “count” per setting using `sameLocalCalendarDay(completedAt, date)` when repair off; walk backward from `asOf` with `addJournalDays`; compute longest over all contiguous runs. Pack streak uses `completedByPack[packId]` as the completion timestamp for the off-setting check.

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -am "feat: compute overall and per-pack streaks by journal date"
```

---

### Task 5: Random prompt draw stability

**Files:**
- Create: `src/domain/randomDraw.ts`
- Test: `src/domain/randomDraw.test.ts`

**Interfaces:**
- Produces: `ensurePromptDraw(entry, pack, rng) -> { entry, fieldIds }` — if draw already stored, return it; else sample `drawCount` from pool without replacement, store on entry

- [ ] **Step 1–4:** TDD: same `(date, packId)` returns same ids when already stored; new draw length equals `drawCount`; throws if pool too small

```ts
export function ensurePromptDraw(
  entry: DailyEntry,
  pack: ContentPack,
  rng: () => number = Math.random,
): { entry: DailyEntry; fieldIds: string[] } {
  if (pack.promptMode !== "random") {
    return { entry, fieldIds: pack.fields.map((f) => f.id) };
  }
  const existing = entry.promptDraw[pack.id];
  if (existing?.length) return { entry, fieldIds: existing };

  const pool = pack.pool ?? [];
  const n = pack.drawCount ?? 1;
  if (pool.length < n) throw new Error(`Pool too small for pack ${pack.id}`);

  const ids = pool.map((f) => f.id);
  // Fisher-Yates partial shuffle using rng()
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const fieldIds = ids.slice(0, n);
  return {
    entry: {
      ...entry,
      promptDraw: { ...entry.promptDraw, [pack.id]: fieldIds },
    },
    fieldIds,
  };
}
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: stable random prompt draws per journal day"
```

---

### Task 6: Stats aggregations (exclude unanswered)

**Files:**
- Create: `src/domain/stats.ts`
- Test: `src/domain/stats.test.ts`

**Interfaces:**
- Produces: `aggregateNumberField()`, `aggregateYesNoField()`, `countLongTextField()`

- [ ] **Step 1: Failing tests proving unanswered excluded**

```ts
it("does not treat unanswered number as 0", () => {
  const entries = [
    { answers: [{ fieldRef: "p:n", value: 2 }] },
    { answers: [{ fieldRef: "p:n", value: null }] },
    { answers: [] },
  ] as DailyEntry[];
  const r = aggregateNumberField(entries as DailyEntry[], "p:n");
  expect(r.count).toBe(1);
  expect(r.sum).toBe(2);
  expect(r.avg).toBe(2);
});

it("tracks yes and no rates only over answered", () => {
  const entries = [
    { answers: [{ fieldRef: "p:y", value: true }] },
    { answers: [{ fieldRef: "p:y", value: false }] },
    { answers: [{ fieldRef: "p:y", value: null }] },
  ] as DailyEntry[];
  const r = aggregateYesNoField(entries as DailyEntry[], "p:y");
  expect(r.yesCount).toBe(1);
  expect(r.noCount).toBe(1);
  expect(r.yesRate).toBe(0.5);
  expect(r.noRate).toBe(0.5);
});
```

- [ ] **Step 2: Implement + PASS + commit**

```bash
git commit -am "feat: stats aggregations excluding unanswered fields"
```

---

### Task 7: Dexie schema and repositories

**Files:**
- Create: `src/db/database.ts`, `src/db/entriesRepo.ts`, `src/db/packsRepo.ts`, `src/db/skinsRepo.ts`, `src/db/settingsRepo.ts`, `src/db/searchIndex.ts`
- Test: `src/db/entriesRepo.test.ts`

**Interfaces:**
- Produces: `db`, `getOrCreateEntry(profileId, date)`, `upsertEntry`, `listEntriesInRange`, `putPack`, `listPacks`, `getSettings`, `saveSettings`

Schema:

```ts
import Dexie, { type Table } from "dexie";
import type { ContentPack, DailyEntry, ProfileSettings, Skin } from "../domain/types";

export class JournalDB extends Dexie {
  entries!: Table<DailyEntry, string>;
  packs!: Table<ContentPack, string>;
  skins!: Table<Skin, string>;
  settings!: Table<ProfileSettings, string>;
  search!: Table<{ id: string; profileId: string; date: string; text: string }, string>;

  constructor() {
    super("hfl_journal");
    this.version(1).stores({
      entries: "id, profileId, date, [profileId+date]",
      packs: "id",
      skins: "id",
      settings: "profileId",
      search: "id, profileId, date, *text",
    });
  }
}

export const db = new JournalDB();
```

`getOrCreateEntry` must set `date` to the requested journal date and timestamps to `now`, never swap them.

Search index: concatenate body + answer values into `text` on each upsert.

- [ ] **Steps:** TDD getOrCreate for missing day; upsert updates search; commit

```bash
git commit -am "feat: Dexie schema and entry/pack repositories"
```

---

### Task 8: Built-in HFL pack + first-run seed

**Files:**
- Create: `src/packs/hflBuiltIn.ts`, `src/db/seed.ts`
- Test: `src/db/seed.test.ts`

**Interfaces:**
- Produces: `HFL_PACK`, `HFL_SKIN`, `ensureSeeded(profileId)`

HFL content: one required `longText` prompt (“What surprised you today?”), `promptMode: "fixed"`, `hideFreeWrite: false`.  
Minimal skin tokens (non-purple, ocean-adjacent neutrals OK for default).

Seed: if no settings row, write settings with `activeContentPackIds: ["hfl"]`, `activeSkinId: "hfl-minimal"`, `backdateRepairsStreak: true`, `requireFreeWrite: false`, backup defaults off/false.

- [ ] **Commit:** `feat: seed Homework for Life built-in pack and skin`

---

### Task 9: App shell, routing, Today entry UI

**Files:**
- Create: `src/ui/layout/AppShell.tsx`, `src/ui/layout/BottomNav.tsx`, `src/ui/today/EntryPage.tsx`, `src/ui/today/PackSection.tsx`, `src/ui/today/JumpToPack.tsx`, `src/ui/skin/applySkin.ts`
- Modify: `src/App.tsx`, `src/main.tsx`, `src/styles/global.css`

**Interfaces:**
- Routes: `/` today, `/entry/:date`, `/calendar`, `/stats`, `/packs`, `/more`, `/search`
- Entry page: autosave debounce 300ms; date control; collapsible packs; jump dropdown; Saved/Saving indicator; apply sticky completion on each save

- [ ] **Step 1:** Wire router + bottom nav (Today, Calendar, Stats, Packs, More)
- [ ] **Step 2:** `EntryPage` loads `getOrCreateEntry`, ensures prompt draws for random packs, renders free-write unless hidden, maps active packs to `PackSection`
- [ ] **Step 3:** `JumpToPack` select scrolls to `id={`pack-${packId}`}`; chevron collapses section; persist collapse in settings optional
- [ ] **Step 4:** Manual check in browser: type, refresh, draft persists
- [ ] **Step 5: Commit**

```bash
git commit -am "feat: phone shell and today entry with multipack sections"
```

---

### Task 10: Calendar page

**Files:**
- Create: `src/ui/calendar/CalendarPage.tsx`
- Test: optional light test for day-state helper `src/domain/calendarState.ts`

**Behavior:**
- Month grid by journal date
- States: empty / draft (entry exists, no overall complete) / completed
- Optional dots for packs with `completedByPack`
- Tap day → `navigate(/entry/YYYY-MM-DD)` which getOrCreates draft

- [ ] **Commit:** `feat: calendar month view opens or creates journal-date drafts`

---

### Task 11: Pack zip import/export + Dive log sample

**Files:**
- Create: `src/packs/manifest.ts`, `src/packs/importZip.ts`, `src/packs/exportZip.ts`, `src/packs/diveLogSample/*`, script or checked-in `public/samples/dive-log.zip`
- Test: `src/packs/importZip.test.ts`

**Manifest shape:**

```ts
export interface BundleManifest {
  name: string;
  version: string;
  skinIds?: string[];
  contentPackIds?: string[];
  activateOnImport?: { skinId?: string; contentPackIds?: string[] };
}
```

Zip layout per spec. Dive pack fields (suggested):

| id | label | type | required |
|----|-------|------|----------|
| time | Dive time | longText | true |
| site | Dive site | longText | true |
| depth | Max depth (m) | number | true |
| buddies | Buddies | longText | false |
| gas | Gas usage | number | false |
| notes | Notes | longText | false |

Ocean skin with tokens + optional simple SVG/PNG tile in sample.

- [ ] **Step 1:** TDD import registers skin + pack independently
- [ ] **Step 2:** Build `public/samples/dive-log.zip`
- [ ] **Step 3:** Export round-trip test
- [ ] **Step 4: Commit** `feat: pack zip import/export and dive-log sample`

---

### Task 12: Packs UI + in-app editors

**Files:**
- Create: `src/ui/packs/PacksPage.tsx`, `ContentPackEditor.tsx`, `SkinEditor.tsx`

**Behavior:**
- Toggle active packs (multi), select skin (single), reorder active packs
- Import file input (zip); button “Import sample dive log” fetching `/samples/dive-log.zip`
- Create/edit content pack + skin (including image file inputs → data URLs with size cap e.g. 1.5MB each)

- [ ] **Commit:** `feat: packs screen with import and editors`

---

### Task 13: Stats UI + milestones

**Files:**
- Create: `src/ui/stats/StatsPage.tsx`, `src/domain/milestones.ts`
- Reuse domain stats/streaks

**Behavior:**
- Overall days + streaks
- Section per installed/active pack with number/yes-no/longText stats
- Range chips 7/30/90/year/all filtering by **journal date**
- Toast when overall current streak hits 7 or 30 (track last toasted in settings)

- [ ] **Commit:** `feat: stats page with per-pack sections and streak milestones`

---

### Task 14: Search & filter

**Files:**
- Create: `src/ui/more/SearchPage.tsx`, enhance `src/db/searchIndex.ts`
- Test: `src/db/searchIndex.test.ts`

**Behavior:**
- Query text against search index
- Filters: date range, pack id present in `contentPackIds` or answers, completed/draft, yes/no for a fieldRef, number min/max
- Result navigates to `/entry/:date?field=packId:fieldId`

- [ ] **Commit:** `feat: search and filter by journal content and trackers`

---

### Task 15: Vault Markdown export/import

**Files:**
- Create: `src/backup/vaultExport.ts`, `src/backup/vaultImport.ts`, `src/backup/download.ts`
- Test: `src/backup/vaultExport.test.ts`

**Behavior:**
- Export zip of `YYYY-MM-DD.md` with YAML front matter + body sections + `[[prev]]`/`[[next]]` links
- Import preview listing conflicts; default newer `updatedAt` wins
- Unencrypted by design

- [ ] **Commit:** `feat: Obsidian-friendly vault export and import`

---

### Task 16: JSON export/import ± encryption

**Files:**
- Create: `src/backup/jsonExport.ts`, `src/backup/jsonImport.ts`, `src/backup/crypto.ts`
- Test: `src/backup/crypto.test.ts`, `src/backup/jsonExport.test.ts`

**Crypto:**
- PBKDF2 + AES-GCM via Web Crypto
- File envelope: `{ v:1, salt, iv, ciphertext }` base64 fields

- [ ] **Commit:** `feat: JSON backup export/import with optional encryption`

---

### Task 17: Backup cadence + on-edit queue

**Files:**
- Create: `src/backup/schedule.ts`, `src/backup/onEditBackup.ts`
- Modify: `MorePage`, entry save path

**Behavior:**
- Settings toggles already on `ProfileSettings`
- On edit: debounced 5s; build full backup zip (JSON unencrypted inside zip is fine for local backup, or reuse vault+json); trigger download/share
- Cadence: on app open, if last backup older than cadence threshold and local time past `backupTimeLocal`, trigger backup catch-up (document phone limitations in More page help text)
- Desktop: optional directory handle stored in IndexedDB if File System Access available

- [ ] **Commit:** `feat: scheduled and on-edit backup triggers`

---

### Task 18: SyncAdapter stub + More page settings polish

**Files:**
- Create: `src/sync/SyncAdapter.ts`
- Modify: `src/ui/more/MorePage.tsx`

```ts
export interface SyncAdapter {
  push(profileId: string): Promise<void>;
  pull(profileId: string): Promise<void>;
}

export class NoopSyncAdapter implements SyncAdapter {
  async push(): Promise<void> {}
  async pull(): Promise<void> {}
}
```

More page: streak repair toggle, requireFreeWrite, backup controls, export buttons, import, skin shortcut.

- [ ] **Commit:** `feat: settings surface and noop sync adapter stub`

---

### Task 19: End-to-end verification checklist

**Files:** none (manual + automated integration test)

- [ ] **Step 1: Automated integration**

`src/packs/multipack.integration.test.ts`: seed HFL → import dive zip fixture → activate both → write entry with dive required fields + HFL prompt → assert per-pack completion → export vault + encrypted JSON → wipe db → import → entry restored with same journal `date`.

- [ ] **Step 2: Manual phone checklist**

- Install PWA; airplane mode create entry
- Calendar empty day → draft for that journal date
- Collapse/jump packs
- Stats: leave number blank on a day; confirm average ignores it
- Backup on edit produces a file
- Import dive sample zip from Packs

- [ ] **Step 3: Final commit**

```bash
git commit -am "test: multipack import/export integration coverage"
```

---

## Spec coverage self-check

| Spec area | Task(s) |
|-----------|---------|
| PWA offline shell | 1, 9 |
| One entry / journal date / backdate | 2, 7, 9, 10 |
| Sticky completion + requireFreeWrite | 3 |
| Per-pack + overall streaks + repair setting | 4, 13 |
| Random prompts stable | 5 |
| Stats exclude unanswered; yes/no both rates | 6, 13 |
| Dexie + profileId | 7 |
| HFL built-in | 8 |
| Entry UX collapse/jump | 9 |
| Calendar → draft | 10 |
| Zip packs; dive sample | 11, 12 |
| Skin images | 11, 12, `applySkin` |
| Search/filter | 14 |
| Vault MD export/import | 15 |
| JSON ± encrypt | 16 |
| Backup cadence + on edit | 17 |
| Sync stub | 18 |
| Multipack verification | 19 |

**Placeholder scan:** none intentional — domain code inlined for Tasks 2–6; UI tasks specify behavior and file paths for implementation during execution.

**Type consistency:** `DailyEntry.date` is journal date; `fieldRef` format `packId:fieldId`; settings flags match spec defaults.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-22-homework-for-life-journal.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration  
2. **Inline Execution** — execute tasks in this session with executing-plans checkpoints  

Which approach?
