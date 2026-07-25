export const STREAK_MILESTONES = [7, 30] as const;

export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

function effectiveLastToasted(
  currentStreak: number,
  lastToasted: number | undefined,
): number | undefined {
  if (lastToasted !== undefined && currentStreak < lastToasted) return undefined;
  return lastToasted;
}

export function streakMilestoneToToast(
  currentStreak: number,
  lastToasted?: number,
): StreakMilestone | null {
  if (currentStreak === 0) return null;

  const effective = effectiveLastToasted(currentStreak, lastToasted);

  for (const milestone of STREAK_MILESTONES) {
    if (currentStreak === milestone && (effective ?? 0) < milestone) {
      return milestone;
    }
  }

  return null;
}

export function updatedLastToastedStreakMilestone(
  currentStreak: number,
  lastToasted: number | undefined,
  toasted: StreakMilestone,
): number | undefined {
  if (currentStreak === 0) return undefined;
  if (lastToasted !== undefined && currentStreak < lastToasted) return toasted;
  return Math.max(lastToasted ?? 0, toasted);
}

export function streakMilestoneMessage(milestone: StreakMilestone): string {
  return `${milestone}-day streak!`;
}
