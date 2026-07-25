import { beforeEach, describe, expect, it } from "vitest";
import { HFL_SKIN } from "../packs/hflBuiltIn";
import { db } from "./database";
import { ensureSeeded } from "./seed";
import { deleteSkin, getSkin, putSkin } from "./skinsRepo";

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureSeeded("local");
});

describe("deleteSkin", () => {
  it("removes a non-built-in skin", async () => {
    await putSkin({
      ...HFL_SKIN,
      id: "ocean",
      name: "Ocean",
    });

    await deleteSkin("ocean");

    expect(await getSkin("ocean")).toBeUndefined();
    expect(await getSkin("hfl-minimal")).toEqual(HFL_SKIN);
  });
});
