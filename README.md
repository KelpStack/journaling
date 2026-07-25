# DiaryDeck

Phone-first offline journaling PWA with mix-and-match skins and content packs, calendar, streaks/stats, search, and Obsidian-friendly export.

Licensed under [PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0) — free to use and modify for non-commercial purposes. See `LICENSE`.

## Run locally

```bash
npm install
npm run dev
```

## Hosted on GitHub Pages

After deploy: **https://kelpstack.github.io/journaling/**

Local `npm run build` uses `/` as the base path. The GitHub Actions workflow builds with `VITE_BASE_PATH=/journaling/` for Pages.

## Docs

- Design: `docs/superpowers/specs/2026-07-22-homework-for-life-journal-design.md`
- Plan: `docs/superpowers/plans/2026-07-22-homework-for-life-journal.md`
