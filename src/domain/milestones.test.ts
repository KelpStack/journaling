import { describe, expect, it } from "vitest";
import {
  streakMilestoneMessage,
  streakMilestoneToToast,
  updatedLastToastedStreakMilestone,
} from "./milestones";

describe("milestones", () => {
  it("toasts at 7 and 30 when not yet toasted", () => {
    expect(streakMilestoneToToast(7)).toBe(7);
    expect(streakMilestoneToToast(30)).toBe(30);
  });

  it("does not re-toast the same milestone", () => {
    expect(streakMilestoneToToast(7, 7)).toBeNull();
    expect(streakMilestoneToToast(30, 30)).toBeNull();
  });

  it("allows 30 after 7 was toasted", () => {
    expect(streakMilestoneToToast(30, 7)).toBe(30);
  });

  it("toasts again after streak break when lastToasted is stale", () => {
    expect(streakMilestoneToToast(7, 30)).toBe(7);
    expect(updatedLastToastedStreakMilestone(7, 30, 7)).toBe(7);
  });

  it("resets last toasted tracking when streak ends", () => {
    expect(updatedLastToastedStreakMilestone(0, 30, 30)).toBeUndefined();
  });

  it("records the highest toasted milestone", () => {
    expect(updatedLastToastedStreakMilestone(30, 7, 30)).toBe(30);
  });

  it("formats milestone messages", () => {
    expect(streakMilestoneMessage(7)).toBe("7-day streak!");
    expect(streakMilestoneMessage(30)).toBe("30-day streak!");
  });
});
