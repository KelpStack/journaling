import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CalendarPage } from "./ui/calendar/CalendarPage";
import { AppShell } from "./ui/layout/AppShell";
import { MorePage } from "./ui/more/MorePage";
import { SearchPage } from "./ui/more/SearchPage";
import { PacksPage } from "./ui/packs/PacksPage";
import { EntryPage } from "./ui/today/EntryPage";
import { StatsPage } from "./ui/stats/StatsPage";

const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

function App() {
  return (
    <BrowserRouter basename={routerBasename === "/" ? undefined : routerBasename}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<EntryPage />} />
          <Route path="entry/:date" element={<EntryPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="packs" element={<PacksPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
