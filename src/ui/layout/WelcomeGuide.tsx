import { useId, useState } from "react";

export interface WelcomeGuideProps {
  onDismiss: (dontShowAgain: boolean) => void;
}

export function WelcomeGuide({ onDismiss }: WelcomeGuideProps) {
  const titleId = useId();
  const [dontShowAgain, setDontShowAgain] = useState(true);

  return (
    <div className="welcome-guide" role="presentation">
      <div
        className="welcome-guide__backdrop"
        aria-hidden="true"
        onClick={() => onDismiss(dontShowAgain)}
      />
      <div
        className="welcome-guide__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="welcome-guide__title">
          Welcome to DiaryDeck
        </h2>
        <div className="welcome-guide__body">
          <p>
            Your journal stays offline on this device. Nothing is uploaded to a
            server — keep your own backups from More when you care about the
            data.
          </p>
          <p>
            <strong>Packs</strong> is where you pick prompt packs and themes.
            Homework for Life and Travel Log are enabled by default; you can
            disable either (or switch themes) anytime on the Packs tab.
          </p>
          <p>
            Fill the required prompts for a day to mark it complete. Streaks
            count completed days. By default, finishing a past date still
            repairs your streak, and free-write is optional for overall
            completion. Change those under <strong>More → Journal</strong>.
          </p>
          <p>
            Use <strong>Calendar</strong> to browse days, <strong>Stats</strong>{" "}
            for streaks and trackers, and <strong>More</strong> for backups,
            export, and the rest of the settings.
          </p>
        </div>
        <div className="welcome-guide__footer">
          <button
            type="button"
            className="welcome-guide__ok"
            onClick={() => onDismiss(dontShowAgain)}
          >
            Got it
          </button>
          <label className="welcome-guide__dont-show">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(event) => setDontShowAgain(event.target.checked)}
            />
            <span>Don&apos;t show again</span>
          </label>
        </div>
      </div>
    </div>
  );
}
