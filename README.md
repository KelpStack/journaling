# DiaryDeck

Phone-first offline journaling PWA with mix-and-match skins and content packs, calendar, streaks/stats, search, and Obsidian-friendly export.

Licensed under [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html). See `LICENSE`.

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
