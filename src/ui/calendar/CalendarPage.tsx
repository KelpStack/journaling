import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listEntriesInRange } from "../../db/entriesRepo";
import {
  addMonthsToJournalDate,
  buildMonthGrid,
  firstOfMonth,
  monthLabel,
  monthRangeForGrid,
  type CalendarDayCell,
} from "../../domain/calendarState";
import { todayJournalDate } from "../../domain/dates";
import type { JournalDate } from "../../domain/types";

const PROFILE_ID = "local";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarPage() {
  const navigate = useNavigate();
  const today = todayJournalDate();
  const [monthStart, setMonthStart] = useState(() => firstOfMonth(today));
  const [cells, setCells] = useState<CalendarDayCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError(null);

      try {
        const { start, end } = monthRangeForGrid(monthStart);
        const entries = await listEntriesInRange(PROFILE_ID, start, end);
        const entriesByDate = new Map(entries.map((entry) => [entry.date, entry]));
        const grid = buildMonthGrid(monthStart, entriesByDate);

        if (!cancelled) {
          setCells(grid);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Failed to load calendar");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [monthStart]);

  const openDay = (date: JournalDate) => {
    navigate(`/entry/${date}`);
  };

  return (
    <div className="calendar-page">
      <header className="calendar-header">
        <button
          type="button"
          className="calendar-nav-btn"
          aria-label="Previous month"
          onClick={() => setMonthStart((current) => addMonthsToJournalDate(current, -1))}
        >
          ‹
        </button>
        <h1 className="calendar-title">{monthLabel(monthStart)}</h1>
        <button
          type="button"
          className="calendar-nav-btn"
          aria-label="Next month"
          onClick={() => setMonthStart((current) => addMonthsToJournalDate(current, 1))}
        >
          ›
        </button>
      </header>

      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="calendar-weekday">
            {label}
          </span>
        ))}
      </div>

      {loadError ? (
        <p className="calendar-error">{loadError}</p>
      ) : loading ? (
        <p className="calendar-loading">Loading calendar…</p>
      ) : (
        <div className="calendar-grid" role="grid" aria-label={monthLabel(monthStart)}>
          {cells.map((cell) => {
            const dayNumber = Number(cell.date.slice(8, 10));
            const classNames = [
              "calendar-day",
              `calendar-day--${cell.state}`,
              cell.inMonth ? "" : "calendar-day--outside",
              cell.date === today ? "calendar-day--today" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={cell.date}
                type="button"
                role="gridcell"
                className={classNames}
                aria-label={`${cell.date}, ${cell.state}`}
                onClick={() => openDay(cell.date)}
              >
                <span className="calendar-day__number">{dayNumber}</span>
                {cell.completedPackIds.length > 0 && (
                  <span className="calendar-day__dots" aria-hidden="true">
                    {cell.completedPackIds.map((packId) => (
                      <span key={packId} className="calendar-day__dot" />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <p className="calendar-footer">
        <Link className="calendar-search-button" to="/search">
          View &amp; search entries
        </Link>
      </p>
    </div>
  );
}
