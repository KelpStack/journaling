import JSZip from "jszip";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/database";
import { getOrCreateEntry } from "../db/entriesRepo";
import { ensureSeeded } from "../db/seed";
import { addJournalDays } from "../domain/dates";
import type { DailyEntry } from "../domain/types";
import { entryFilename, entryToMarkdown, exportVaultZip } from "./vaultExport";
import { importVaultZip, parseVaultMarkdown, previewVaultImport } from "./vaultImport";

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureSeeded("local");
});

async function sampleEntry(
  date = "2026-07-20",
  overrides: Partial<DailyEntry> = {},
): Promise<DailyEntry> {
  const base = await getOrCreateEntry("local", date);
  const entry: DailyEntry = {
    ...base,
    body: "Rain on the walk home.",
    answers: [{ fieldRef: "hfl:surprise", value: "Unexpected kindness" }],
    completedByPack: { hfl: "2026-07-20T18:00:00.000Z" },
    completedAt: "2026-07-20T18:00:00.000Z",
    skinId: "hfl-minimal",
    contentPackIds: ["hfl"],
    promptDraw: { hfl: { reflection: ["surprise"] } },
    createdAt: "2026-07-20T10:00:00.000Z",
    updatedAt: "2026-07-20T18:00:00.000Z",
    ...overrides,
  };
  await db.entries.put(entry);
  return entry;
}

describe("entryToMarkdown", () => {
  it("writes YAML front matter, body sections, and wiki links", async () => {
    await sampleEntry();
    const entry = (await db.entries.get("local:2026-07-20"))!;
    const markdown = await entryToMarkdown(entry);

    expect(markdown).toMatch(/^---\n/);
    expect(markdown).toContain("date: \"2026-07-20\"");
    expect(markdown).toContain("profileId: \"local\"");
    expect(markdown).toContain("fieldRef: \"hfl:surprise\"");
    expect(markdown).toContain("## Free write");
    expect(markdown).toContain("Rain on the walk home.");
    expect(markdown).toContain("## Homework for Life");
    expect(markdown).toContain("### Reflection");
    expect(markdown).toContain("### What surprised you today?");
    expect(markdown).toContain("Unexpected kindness");

    const prev = addJournalDays(entry.date, -1);
    const next = addJournalDays(entry.date, 1);
    expect(markdown).toContain(`[[${prev}]] · [[${next}]]`);
  });
});

describe("exportVaultZip", () => {
  it("names files by journal date", async () => {
    await sampleEntry("2026-07-20");
    await sampleEntry("2026-07-21", {
      body: "Second day",
      answers: [],
      completedByPack: {},
      completedAt: undefined,
      updatedAt: "2026-07-21T09:00:00.000Z",
      createdAt: "2026-07-21T08:00:00.000Z",
    });

    const blob = await exportVaultZip({ profileId: "local" });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const paths = Object.keys(zip.files).filter((p) => !zip.files[p]!.dir);

    expect(paths.some((p) => p.endsWith(entryFilename("2026-07-20")))).toBe(true);
    expect(paths.some((p) => p.endsWith(entryFilename("2026-07-21")))).toBe(true);
  });
});

describe("vault import round-trip", () => {
  it("restores entry data after export and import", async () => {
    const original = await sampleEntry();
    const exported = await exportVaultZip({ profileId: "local" });

    await db.entries.clear();
    await db.search.clear();

    const result = await importVaultZip(await exported.arrayBuffer(), {
      profileId: "local",
    });

    expect(result.imported).toBe(1);
    const restored = await db.entries.get(original.id);
    expect(restored).toMatchObject({
      date: "2026-07-20",
      body: "Rain on the walk home.",
      skinId: "hfl-minimal",
      contentPackIds: ["hfl"],
    });
    expect(restored?.answers).toEqual([
      { fieldRef: "hfl:surprise", value: "Unexpected kindness" },
    ]);
    expect(restored?.completedByPack).toEqual({ hfl: "2026-07-20T18:00:00.000Z" });
    expect(restored?.promptDraw).toEqual({ hfl: { reflection: ["surprise"] } });
  });

  it("preserves multiline longText answers through export and import", async () => {
    const multiline = "Line one\nLine two\n\nLine four";
    await sampleEntry("2026-07-20", {
      answers: [{ fieldRef: "hfl:surprise", value: multiline }],
    });

    const exported = await exportVaultZip({ profileId: "local" });
    await db.entries.clear();
    await db.search.clear();

    await importVaultZip(await exported.arrayBuffer(), { profileId: "local" });

    const restored = await db.entries.get("local:2026-07-20");
    expect(restored?.answers).toEqual([{ fieldRef: "hfl:surprise", value: multiline }]);
  });
});

describe("previewVaultImport", () => {
  it("lists new entries and conflicts with newer-updatedAt winner", async () => {
    await sampleEntry("2026-07-20", { updatedAt: "2026-07-20T10:00:00.000Z" });

    const newerMarkdown = await entryToMarkdown({
      ...(await db.entries.get("local:2026-07-20"))!,
      body: "Updated body",
      updatedAt: "2026-07-20T20:00:00.000Z",
    });

    const zip = new JSZip();
    zip.file("vault/2026-07-20.md", newerMarkdown);
    zip.file(
      "vault/2026-07-22.md",
      await entryToMarkdown({
        id: "local:2026-07-22",
        profileId: "local",
        date: "2026-07-22",
        body: "Brand new",
        answers: [],
        completedByPack: {},
        skinId: "hfl-minimal",
        contentPackIds: ["hfl"],
        promptDraw: {},
        tags: [],
        createdAt: "2026-07-22T08:00:00.000Z",
        updatedAt: "2026-07-22T08:00:00.000Z",
      }),
    );

    const preview = await previewVaultImport(await zip.generateAsync({ type: "arraybuffer" }));

    expect(preview.newEntries).toEqual(["2026-07-22"]);
    expect(preview.conflicts).toHaveLength(1);
    expect(preview.conflicts[0]).toMatchObject({
      date: "2026-07-20",
      winner: "imported",
    });
  });

  it("lists equal updatedAt entries as unchanged", async () => {
    const updatedAt = "2026-07-20T18:00:00.000Z";
    await sampleEntry("2026-07-20", { updatedAt });

    const sameTimestampMarkdown = await entryToMarkdown({
      ...(await db.entries.get("local:2026-07-20"))!,
      body: "Different body same timestamp",
      updatedAt,
    });

    const zip = new JSZip();
    zip.file("2026-07-20.md", sameTimestampMarkdown);

    const preview = await previewVaultImport(await zip.generateAsync({ type: "arraybuffer" }));

    expect(preview.unchanged).toEqual(["2026-07-20"]);
    expect(preview.conflicts).toHaveLength(0);
  });
});

describe("importVaultZip conflict policy", () => {
  it("keeps existing entry when it is newer", async () => {
    await sampleEntry("2026-07-20", { updatedAt: "2026-07-20T20:00:00.000Z" });

    const olderMarkdown = await entryToMarkdown({
      ...(await db.entries.get("local:2026-07-20"))!,
      body: "Stale import",
      updatedAt: "2026-07-20T10:00:00.000Z",
    });

    const zip = new JSZip();
    zip.file("2026-07-20.md", olderMarkdown);

    const result = await importVaultZip(await zip.generateAsync({ type: "arraybuffer" }));
    expect(result.skipped).toBe(1);
    expect((await db.entries.get("local:2026-07-20"))?.body).toBe("Rain on the walk home.");
  });

  it("imports when imported updatedAt is newer", async () => {
    await sampleEntry("2026-07-20", { updatedAt: "2026-07-20T10:00:00.000Z" });

    const newerMarkdown = await entryToMarkdown({
      ...(await db.entries.get("local:2026-07-20"))!,
      body: "Fresh import",
      updatedAt: "2026-07-20T20:00:00.000Z",
    });

    const zip = new JSZip();
    zip.file("2026-07-20.md", newerMarkdown);

    const result = await importVaultZip(await zip.generateAsync({ type: "arraybuffer" }));
    expect(result.imported).toBe(1);
    expect((await db.entries.get("local:2026-07-20"))?.body).toBe("Fresh import");
  });

  it("honors forceOverwrite for older imports", async () => {
    await sampleEntry("2026-07-20", { updatedAt: "2026-07-20T20:00:00.000Z" });

    const olderMarkdown = await entryToMarkdown({
      ...(await db.entries.get("local:2026-07-20"))!,
      body: "Forced import",
      updatedAt: "2026-07-20T10:00:00.000Z",
    });

    const zip = new JSZip();
    zip.file("2026-07-20.md", olderMarkdown);

    await importVaultZip(await zip.generateAsync({ type: "arraybuffer" }), {
      forceOverwrite: ["2026-07-20"],
    });

    expect((await db.entries.get("local:2026-07-20"))?.body).toBe("Forced import");
  });

  it("skips import when updatedAt timestamps are equal", async () => {
    const updatedAt = "2026-07-20T18:00:00.000Z";
    await sampleEntry("2026-07-20", { updatedAt, body: "Keep me" });

    const sameTimestampMarkdown = await entryToMarkdown({
      ...(await db.entries.get("local:2026-07-20"))!,
      body: "Do not overwrite",
      updatedAt,
    });

    const zip = new JSZip();
    zip.file("2026-07-20.md", sameTimestampMarkdown);

    const result = await importVaultZip(await zip.generateAsync({ type: "arraybuffer" }));
    expect(result.skipped).toBe(1);
    expect(result.imported).toBe(0);
    expect((await db.entries.get("local:2026-07-20"))?.body).toBe("Keep me");
  });
});

describe("parseVaultMarkdown", () => {
  it("parses yes/no and number answers from front matter", () => {
    const markdown = `---
date: "2026-07-01"
profileId: "local"
skinId: "hfl-minimal"
contentPackIds:
  - hfl
completedByPack: {}
answers:
  - fieldRef: "dive:depth"
    value: 12
  - fieldRef: "dive:night"
    value: true
promptDraw: {}
tags: []
createdAt: "2026-07-01T08:00:00.000Z"
updatedAt: "2026-07-01T09:00:00.000Z"
---

[[2026-06-30]] · [[2026-07-02]]

# 2026-07-01

## Free write

Dive day.

## Dive Log

### Depth

12
`;

    const entry = parseVaultMarkdown(markdown);
    expect(entry.date).toBe("2026-07-01");
    expect(entry.body).toBe("Dive day.");
    expect(entry.answers).toEqual([
      { fieldRef: "dive:depth", value: 12 },
      { fieldRef: "dive:night", value: true },
    ]);
  });
});

describe("vault import validation", () => {
  it("rejects files when filename date differs from front matter date", async () => {
    const markdown = await entryToMarkdown({
      id: "local:2026-07-21",
      profileId: "local",
      date: "2026-07-21",
      body: "Wrong file name",
      answers: [],
      completedByPack: {},
      skinId: "hfl-minimal",
      contentPackIds: ["hfl"],
      promptDraw: {},
      tags: [],
      createdAt: "2026-07-21T08:00:00.000Z",
      updatedAt: "2026-07-21T08:00:00.000Z",
    });

    const zip = new JSZip();
    zip.file("vault/2026-07-20.md", markdown);

    const preview = await previewVaultImport(await zip.generateAsync({ type: "arraybuffer" }));
    expect(preview.errors).toHaveLength(1);
    expect(preview.errors[0]?.path).toContain("2026-07-20.md");
    expect(preview.errors[0]?.message).toContain("2026-07-20");
    expect(preview.errors[0]?.message).toContain("2026-07-21");
    expect(preview.newEntries).toHaveLength(0);

    const result = await importVaultZip(await zip.generateAsync({ type: "arraybuffer" }));
    expect(result.rejected).toBe(1);
    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
  });
});
