import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { maybeRunScheduledBackup } from "../../backup/schedule";
import { ensureSeeded } from "../../db/seed";
import { getSettings } from "../../db/settingsRepo";
import { listSkins } from "../../db/skinsRepo";
import { HFL_SKIN } from "../../packs/hflBuiltIn";
import { applySkin } from "../skin/applySkin";
import { BottomNav } from "./BottomNav";

const PROFILE_ID = "local";

export function AppShell() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await ensureSeeded(PROFILE_ID);
      const settings = await getSettings(PROFILE_ID);
      const skins = await listSkins();
      const skin =
        skins.find((item) => item.id === settings?.activeSkinId) ?? HFL_SKIN;
      applySkin(skin);
      void maybeRunScheduledBackup(PROFILE_ID);
      if (!cancelled) {
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <div className="app-loading">Loading…</div>;
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
