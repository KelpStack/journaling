import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./database";
import { getOrCreateEntry, upsertEntry } from "./entriesRepo";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("getOrCreateEntry", () => {
  it("creates entry for missing day with requested journal date", async () => {
    const entry = await getOrCreateEntry("local", "2026-01-15");

    expect(entry.date).toBe("2026-01-15");
    expect(entry.id).toBe("local:2026-01-15");
    expect(entry.profileId).toBe("local");
    expect(entry.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns existing entry without changing date", async () => {
    const first = await getOrCreateEntry("local", "2026-03-10");
    first.body = "existing draft";
    await upsertEntry(first);

    const second = await getOrCreateEntry("local", "2026-03-10");

    expect(second.id).toBe(first.id);
    expect(second.date).toBe("2026-03-10");
    expect(second.body).toBe("existing draft");
  });
});

describe("upsertEntry", () => {
  it("updates search index with body and answer values", async () => {
    const entry = await getOrCreateEntry("local", "2026-07-20");
    await upsertEntry({
      ...entry,
      body: "Surprised by rain",
      answers: [{ fieldRef: "hfl:surprise", value: "A lot" }],
    });

    const searchRow = await db.search.get(entry.id);
    expect(searchRow).toMatchObject({
      id: entry.id,
      profileId: "local",
      date: "2026-07-20",
    });
    expect(searchRow?.text).toContain("Surprised by rain");
    expect(searchRow?.text).toContain("A lot");
  });

  it("does not persist empty drafts", async () => {
    const entry = await getOrCreateEntry("local", "2026-08-01");
    await upsertEntry(entry);

    expect(await db.entries.get(entry.id)).toBeUndefined();
    expect(await db.search.get(entry.id)).toBeUndefined();
  });

  it("removes a previously saved entry when cleared", async () => {
    const entry = await getOrCreateEntry("local", "2026-08-02");
    await upsertEntry({ ...entry, body: "Keep me" });
    expect(await db.entries.get(entry.id)).toBeTruthy();

    await upsertEntry({ ...entry, body: "", answers: [] });
    expect(await db.entries.get(entry.id)).toBeUndefined();
    expect(await db.search.get(entry.id)).toBeUndefined();
  });
});
