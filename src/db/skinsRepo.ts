import type { Skin } from "../domain/types";
import { db } from "./database";

export async function putSkin(skin: Skin): Promise<void> {
  await db.skins.put(skin);
}

export async function listSkins(): Promise<Skin[]> {
  return db.skins.toArray();
}

export async function getSkin(id: string): Promise<Skin | undefined> {
  return db.skins.get(id);
}

export async function deleteSkin(id: string): Promise<void> {
  await db.skins.delete(id);
}
