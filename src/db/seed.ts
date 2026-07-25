import type { ProfileId } from "../domain/types";
import { HFL_PACK } from "../packs/builtInPacks";
import { OCEAN_SKIN } from "../packs/builtInSkins";
import { HFL_SKIN } from "../packs/hflBuiltIn";
import { putPack } from "./packsRepo";
import { getSettings, saveSettings } from "./settingsRepo";
import { putSkin } from "./skinsRepo";

/**
 * Ensures built-in packs + skins are present and up to date.
 * Built-in records are always upserted (refresh on launch). Profile settings
 * are only created on first run.
 */
export async function ensureSeeded(profileId: ProfileId): Promise<void> {
  await putPack(HFL_PACK);
  await putSkin(HFL_SKIN);
  await putSkin(OCEAN_SKIN);

  const existing = await getSettings(profileId);
  if (existing) {
    return;
  }

  await saveSettings({
    profileId,
    activeContentPackIds: ["hfl"],
    activeSkinId: "ocean",
    backdateRepairsStreak: true,
    requireFreeWrite: false,
    multiPackShowOneAtATime: true,
    backupCadence: "off",
    backupTimeLocal: "09:00",
    backupOnEdit: false,
  });
}
