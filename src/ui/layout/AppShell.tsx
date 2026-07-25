import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { maybeRunScheduledBackup } from "../../backup/schedule";
import { ensureSeeded } from "../../db/seed";
import { getSettings, saveSettings } from "../../db/settingsRepo";
import { listSkins } from "../../db/skinsRepo";
import type { ProfileSettings } from "../../domain/types";
import { OCEAN_SKIN } from "../../packs/builtInSkins";
import { applySkin } from "../skin/applySkin";
import { BottomNav } from "./BottomNav";
import { WelcomeGuide } from "./WelcomeGuide";

const PROFILE_ID = "local";

export function AppShell() {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<ProfileSettings | null>(null);
  const [showWelcomeGuide, setShowWelcomeGuide] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await ensureSeeded(PROFILE_ID);
      const loaded = await getSettings(PROFILE_ID);
      const skins = await listSkins();
      const skin =
        skins.find((item) => item.id === loaded?.activeSkinId) ?? OCEAN_SKIN;
      applySkin(skin);
      void maybeRunScheduledBackup(PROFILE_ID);
      if (!cancelled) {
        setSettings(loaded ?? null);
        setShowWelcomeGuide(Boolean(loaded) && !loaded?.hideWelcomeGuide);
        setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismissWelcomeGuide = (dontShowAgain: boolean) => {
    setShowWelcomeGuide(false);
    if (!dontShowAgain || !settings) return;
    const next = { ...settings, hideWelcomeGuide: true };
    setSettings(next);
    void saveSettings(next);
  };

  if (!ready) {
    return <div className="app-loading">Loading…</div>;
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <Outlet />
      </main>
      <BottomNav />
      {showWelcomeGuide ? (
        <WelcomeGuide onDismiss={dismissWelcomeGuide} />
      ) : null}
    </div>
  );
}
