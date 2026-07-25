# Homework-for-Life Journal — Design Spec

**Date:** 2026-07-22  
**Status:** Draft for user review  
**Approach:** Pack-native local-first PWA (Approach 1)

## 1. Product summary

A phone-first Progressive Web App for daily journaling in the “Homework for Life” spirit, extended with mix-and-match **skins** and **content packs** (prompts + numeric/yes-no trackers), calendar and per-pack streaks/stats, Obsidian-friendly export, encrypted JSON export, and scheduled / on-edit backups. Fully usable offline. Optional cloud sync and multi-profile are future hooks, not v1 features.

### 1.1 Goals

- Launch and start typing with minimal friction
- One entry per calendar day; easy backdating
- Records portable via open formats (Markdown vault unencrypted; JSON optionally encrypted)
- Calendar + light gamification (streaks, milestones)
- Prompt sets: fixed order or random draw (1–10), plus numeric and yes/no trackers
- Multiple content packs active at once (e.g. Homework for Life + Dive log)
- Skins independent of content; bundle zip import with mix-and-match after install
- Search and filter across entries
- Offline-first; sync adapter stubbed for later

### 1.2 Non-goals (v1)

- Live Obsidian vault as source of truth
- Cloud sync UI / accounts
- Multi-profile switcher UI (schema only)
- Native app wrapper (possible later around the same web app)
- NLP / sentiment on long text
- Treating unanswered tracker fields as zero or “no” in stats

---

## 2. Platform & architecture

| Decision | Choice |
|----------|--------|
| Client | Web PWA; possible native wrapper later |
| Primary UX | Phone-first |
| Data | Local-first (IndexedDB via Dexie) |
| Sync (v1) | None; `SyncAdapter` interface stub only |
| Open format | Export/import Obsidian-ready Markdown vault; also JSON (± encryption) |
| Stack | Vite + React + TypeScript, Dexie, JSZip, Web Crypto, CSS variables for skins |

### 2.1 Runtime modules

- **App shell** — routes, PWA install, offline asset cache
- **Domain** — completion, per-pack streaks, random prompt draws, search query building
- **DB** — Dexie schema, repositories, search index maintenance
- **Packs** — manifest validation, import/export, built-in HFL pack, sample Dive log zip
- **Backup** — cadence scheduler (best-effort on phone), on-edit backup queue, vault/JSON writers
- **UI** — Today, Calendar, Stats, Packs, More
- **Sync** — empty adapter for a later phase

### 2.2 Profile hook (future multi-user)

Every persisted record includes `profileId`. v1 always uses `"local"`. Future multi-profile is a switcher + filtered queries; no schema rewrite. **Multiple hobbies are not profiles** — they are multiple active content packs inside one profile, with **per-pack** streaks and stats.

---

## 3. Core concepts

### 3.1 DailyEntry

- Uniqueness: `(profileId, date)` where `date` is the **journal date** (`YYYY-MM-DD`), not created-at
- Backdated (or future-dated) entries are stored and shown under the journal date the user chose
- `createdAt` / `updatedAt` exist for conflict/backup metadata only; UI calendar, streaks, stats, and vault filenames use **journal date**
- `body` — free-write text; hidden when any active pack sets `hideFreeWrite` (if multiple packs disagree: hide if **any** active pack requests hide)
- `answers[]` — `{ fieldRef, value }` where `fieldRef` is `packId:fieldId`; value is string | number | boolean | omitted/null if unanswered
- `completedByPack` — map of packId → completion timestamp (sticky once set)
- `completedAt` — optional overall timestamp when all mandatory fields across packs that were required for that day are satisfied (sticky)
- Snapshot on save: `skinId`, `contentPackIds[]`, and for random packs the locked `promptDraw` per pack so revisiting does not reshuffle
- Optional `tags[]`

### 3.2 ContentPack

- Metadata: id, name, version, description
- `promptMode`: `fixed` | `random`
- `fields[]` (prompts and trackers), each with:
  - `id`, `label`, `type`: `longText` | `number` | `yesNo`
  - `required`: boolean
  - Optional: `unit`, `min`, `max`
  - `stats`: whether to surface in insights; for numbers aggregation hints (sum/avg/min/max)
  - For `yesNo`: optional `preferredAnswer`: `yes` | `no` (for highlights / preferred streaks; both rates always tracked)
- Random mode: `pool[]` of field definitions or prompt texts; `drawCount` 1–10; `pool.length >= drawCount`
- `hideFreeWrite`: boolean
- Field IDs unique within a pack; at runtime namespaced as `packId:fieldId`

**Multi-pack:** User may activate several content packs. Today’s form merges fields in **active pack order**, then field order. Entry screen provides **jump links/dropdown** to pack sections and **collapsible** pack sections.

### 3.3 Skin

- Visual tokens: colors, fonts, accents, density
- Optional images: **tiling background**, **header**, **footer** (stored with skin; size limits enforced on import)
- One active skin at a time; independent of which content packs are active

### 3.4 Bundle zip

```
pack-name/
  manifest.json       # lists included skin and/or content parts; optional default activation
  skin/               # optional
  content/            # optional (one or more content packs)
```

Import registers parts independently. User can remix: e.g. keep Dive content, switch to a discreet business skin.

### 3.5 Built-in vs sample packs

| Pack | Distribution | Purpose |
|------|----------------|---------|
| Homework for Life | Built-in starter (minimal skin + one long-text prompt) | Non-empty first launch |
| Dive log | **Sample zip** (ocean skin + dive fields) shipped under `samples/` or `public/samples/` | Test import + multipack (time, dive site, depth, buddies, gas usage, notes, etc.) |

---

## 4. Completion, streaks & stats

### 4.1 When is a pack “done” for a day?

A content pack is completed for journal date `D` when every **required** field from that pack that applies to `D` (including the locked random draw for that day) has a real answer.

- **Free-write:** optional by default. If hidden by an active pack, it is ignored. A global setting `requireFreeWrite` (default off) may require a non-empty body for **overall** completion only; it does not block per-pack completion.
- **Overall completion:** set when every active pack that contributes required fields for `D` has pack-level completion, and `requireFreeWrite` is satisfied if enabled.
- **Sticky completion:** once marked complete for `(date, packId)` or overall, later clearing a mandatory field does **not** revoke completion or streak credit.

### 4.2 Streaks

Streaks always walk **journal dates** in local timezone (never `createdAt`).

- **Per-pack streak (primary hobby metric):** length of consecutive journal dates ending at the relevant end date where that pack’s sticky completion is set.
- **Overall streak:** consecutive journal dates where the entry’s overall sticky `completedAt` is set. Days-journaled count uses the same overall flag.
- **Backdate repair setting** (default **on**):
  - **On:** a completed journal date counts toward streaks regardless of when the user wrote it (backfills can repair gaps).
  - **Off:** a completion counts toward streaks only if `completedAt` falls on the same local calendar day as the journal date. Backdated fills still appear on the calendar and in stats aggregates, but do not repair streaks.

### 4.3 Stats rules (critical)

- **Unanswered fields are excluded** from aggregates. They are **not** treated as `0` and **not** treated as `no`.
- Number stats (sum/avg/min/max) use only days where that field has a numeric answer.
- Yes/No: track **yes count, no count, yes-rate, no-rate** over answered days only; optional preferred-answer streak uses only answered days.
- Long text: count of days with non-empty answer only.
- Ranges: 7d / 30d / 90d / year / all, based on **journal date**.
- Stats page: overall block + **one section per content pack** (easiest; no hobby switcher required in v1).

### 4.4 Gamification (light)

- Streak displays + calendar heat
- Mild milestones (e.g. 7 / 30 days) via toast — no large badge system in v1

---

## 5. UX

### 5.1 Navigation

Bottom nav: **Today** · **Calendar** · **Stats** · **Packs** · **More**

### 5.2 Today / entry screen

- Default route opens **today’s** journal date entry; focus ready to type
- Continuous local autosave; visible Saved / Saving state
- Date control to jump to another journal date (backdate / future)
- Pack sections: collapsible; jump dropdown/links to later hobbies
- Mandatory vs optional clearly marked
- Navigating away with incomplete mandatories keeps a **draft**; does not force completion

### 5.3 Calendar

- Month view; states: empty / draft / completed (plus compact per-pack progress indicators when useful)
- **Tap a day:** open that journal date’s entry; if none exists, **create and open an empty draft** for that date
- All calendar placement uses **journal date**, never created-at

### 5.4 Search & filter

- Full-text over body + prompt answers
- Filters: date range (journal date), pack, completed/draft, yes/no value, number range, tags
- Results open the entry; scroll to matching field when possible

### 5.5 Packs & skins UI

- List skins and content packs separately
- Multi-select active content packs; single active skin; reorder active packs
- Import zip (bundle or partial); export pack or bundle
- In-app editors for content packs and skins (including image slots)
- Dive log exercised via **import sample zip**, not silent preinstall (HFL remains built-in)

### 5.6 More / settings

- Streak backdate repair toggle (default on)
- Backup cadence + time
- Toggle **backup on entry create/edit**
- Manual Backup now, Export vault, Export JSON (± encrypt), Import
- Appearance follows active skin; skin picker shortcut

---

## 6. Export, import & backup

### 6.1 Vault export (Markdown) — unencrypted by design

- Zip of daily notes named by journal date
- YAML front matter: journal date, profileId, completion maps, skinId, contentPackIds, structured answers, timestamps
- Body: free-write + sections per pack/prompt
- Wiki links: `[[YYYY-MM-DD]]` to adjacent days; optional pack index notes
- Import with preview; conflict policy: newer `updatedAt` wins unless user forces overwrite

### 6.2 JSON export — optionally encrypted

- Full structured dump (entries, packs, skins, settings) suitable for restore
- Optional passphrase → Web Crypto AES-GCM (key via password-based KDF)
- Unencrypted JSON also available

### 6.3 Backup

- **Cadence:** daily/weekly at a chosen time (phone PWA: best-effort via notification / next-open catch-up if OS blocks background work)
- **On create/edit:** optional; debounced/queued so rapid typing does not spawn excessive files
- Desktop Chromium: optional persistent backup folder via File System Access API
- Phone: download / share sheet of zip
- Backup payload: entries + installed packs/skins + settings (restore-complete)

---

## 7. Offline & future sync

- App shell cached; all journal operations work offline after first load
- Sync not required for any v1 feature
- `SyncAdapter` stub: push/pull payloads later; encryption policy deferred
- Native wrapper later may improve background backup and folder access only

---

## 8. Tech stack & layout

```
src/
  db/           # Dexie schema, repos, search index
  domain/       # completion, streaks, random draw, stats (exclude unanswered)
  packs/        # manifest, import/export, HFL built-in
  backup/       # schedule, on-edit queue, vault + JSON writers
  sync/         # SyncAdapter stub
  ui/           # Today, Calendar, Stats, Packs, More
samples/        # dive-log.zip (ocean skin + dive content) for import testing
```

Libraries: Vite, React, TypeScript, Dexie, JSZip, Web Crypto, date library for local-TZ journal dates.

---

## 9. Testing strategy

**Unit**

- Completion sticky behavior
- Per-pack and overall streaks with backdate setting on/off
- Random draw stable per `(profileId, date, packId)`
- Pack field merge + `packId:fieldId` namespacing
- Stats: unanswered excluded; yes/no both rates; preferredAnswer streak
- Journal date vs createdAt never confused in calendar/stats/export filenames

**Integration**

- Import `samples/dive-log.zip` → activate alongside HFL → multipack entry with collapse/jump → export vault + encrypted JSON → reimport

**Manual (phone)**

- Install PWA, airplane mode write, backup-on-edit, long multipack UX, backdate from calendar empty day

---

## 10. Improvements considered (accepted or deferred)

| Idea | Decision |
|------|----------|
| Multi-active content packs + per-pack stats | Accepted (hobbies) |
| `profileId` without UI | Accepted (future multi-user) |
| Vault + encrypted JSON exports | Accepted |
| Backup on edit + cadence | Accepted |
| Skin images (tile/header/footer) | Accepted |
| Dive log as importable zip | Accepted |
| Preferred yes/no polarity | Accepted |
| Unanswered ≠ 0 / no | Accepted |
| Live Obsidian vault sync | Deferred (native/desktop later) |
| E2E cloud sync | Deferred |
| Heavy achievements/badges | Deferred |
| Vault-as-live-DB | Deferred |

### 10.1 Further suggestions (optional, not required for v1)

- **Tags / mood** as a small optional built-in field set
- **Templates for weekly review** exporting a Markdown summary note
- **Data portability test** in CI using the sample dive zip
- **Field “inactive from date”** so pack edits do not confuse historical stats
- **Read-only “on this day”** from prior years (nice for Homework for Life)

---

## 11. Resolved product decisions (checklist)

- [x] PWA first, native wrapper later optional
- [x] Local-first; sync later; encryption policy deferred
- [x] One entry per journal calendar day
- [x] Obsidian-style linked Markdown via export/import (not live vault)
- [x] Skins ⊥ content packs; zip may include either/both; remix after import
- [x] Multi-active content packs; per-pack streaks/stats; stats sections per pack
- [x] `profileId` hook for future profiles
- [x] Streak backdate repair: user setting, default on
- [x] Completion = mandatories filled; sticky; editable after
- [x] Free-write default on; packs may hide it
- [x] Phone-first
- [x] Search + filter
- [x] Entry jump + collapsible pack sections
- [x] Calendar empty day → backdated draft
- [x] Yes and no rates; optional preferred answer
- [x] Vault (plain) + JSON (± encrypted) export
- [x] Backup cadence + on create/edit
- [x] Skin images: tile background, header, footer
- [x] HFL built-in; Dive log sample zip for import testing
- [x] Stats ignore unanswered (not 0 / not no)
- [x] Display and aggregate by journal date, not created-at
- [x] `requireFreeWrite` global setting default off (overall completion only)

---

## 12. Next step

After user approval of this spec, write the implementation plan under `docs/superpowers/plans/` (writing-plans skill) and only then start coding.
