import {
  BookOpen,
  Calendar,
  ChartLine,
  PaintRoller,
  Settings,
  type LucideProps,
} from "lucide-react";

/** Shared Lucide props so nav icons inherit skin color via currentColor. */
const navIconProps: LucideProps = {
  size: 22,
  strokeWidth: 1.75,
  "aria-hidden": true,
};

export function IconDiary() {
  return <BookOpen {...navIconProps} />;
}

export function IconCalendar() {
  return <Calendar {...navIconProps} />;
}

export function IconChart() {
  return <ChartLine {...navIconProps} />;
}

export function IconBrush() {
  return <PaintRoller {...navIconProps} />;
}

export function IconGear() {
  return <Settings {...navIconProps} />;
}
