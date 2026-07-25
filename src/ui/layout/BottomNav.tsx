import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import {
  IconBrush,
  IconCalendar,
  IconChart,
  IconDiary,
  IconGear,
} from "./NavIcons";

const tabs: {
  to: string;
  label: string;
  end?: boolean;
  icon: ReactNode;
}[] = [
  { to: "/", label: "Today", end: true, icon: <IconDiary /> },
  { to: "/calendar", label: "Calendar", icon: <IconCalendar /> },
  { to: "/stats", label: "Stats", icon: <IconChart /> },
  { to: "/packs", label: "Packs", icon: <IconBrush /> },
  { to: "/more", label: "More", icon: <IconGear /> },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main">
      {tabs.map(({ to, label, end, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          aria-label={label}
          title={label}
          className={({ isActive }) =>
            isActive ? "bottom-nav__link bottom-nav__link--active" : "bottom-nav__link"
          }
        >
          {icon}
        </NavLink>
      ))}
    </nav>
  );
}
