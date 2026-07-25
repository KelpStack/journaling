import type { ProfileId, ProfileSettings } from "../domain/types";
import { db } from "./database";

export async function getSettings(
  profileId: ProfileId,
): Promise<ProfileSettings | undefined> {
  return db.settings.get(profileId);
}

export async function saveSettings(settings: ProfileSettings): Promise<void> {
  await db.settings.put(settings);
}
