import type { ContentPack } from "../domain/types";
import { db } from "./database";

export async function putPack(pack: ContentPack): Promise<void> {
  await db.packs.put(pack);
}

export async function listPacks(): Promise<ContentPack[]> {
  return db.packs.toArray();
}

export async function getPack(id: string): Promise<ContentPack | undefined> {
  return db.packs.get(id);
}

export async function deletePack(id: string): Promise<void> {
  await db.packs.delete(id);
}
