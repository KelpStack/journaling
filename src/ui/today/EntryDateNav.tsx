import { useRef } from "react";
import {
  addJournalDays,
  formatEntryDateDisplay,
  type EntryDateFormat,
} from "../../domain/dates";

interface EntryDateNavProps {
  journalDate: string;
  dateFormat: EntryDateFormat;
  onChangeDate: (nextDate: string) => void;
}

export function EntryDateNav({
  journalDate,
  dateFormat,
  onChangeDate,
}: EntryDateNavProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.click();
    }
  };

  return (
    <div className="entry-date-nav">
      <button
        type="button"
        className="entry-date-nav__arrow"
        aria-label="Previous day"
        onClick={() => onChangeDate(addJournalDays(journalDate, -1))}
      >
        «
      </button>

      <button
        type="button"
        className="entry-date-nav__date"
        onClick={openPicker}
        aria-label={`Change date, currently ${formatEntryDateDisplay(journalDate, dateFormat)}`}
      >
        {formatEntryDateDisplay(journalDate, dateFormat)}
      </button>

      <input
        ref={inputRef}
        className="entry-date-nav__picker"
        type="date"
        value={journalDate}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          if (event.target.value) {
            onChangeDate(event.target.value);
          }
        }}
      />

      <button
        type="button"
        className="entry-date-nav__arrow"
        aria-label="Next day"
        onClick={() => onChangeDate(addJournalDays(journalDate, 1))}
      >
        »
      </button>
    </div>
  );
}
