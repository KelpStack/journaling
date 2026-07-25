import type { ContentPack, PackField } from "../domain/types";

const HFL_PROMPTS: PackField[] = [
  {
    id: "surprise",
    label: "What surprised you today?",
    type: "longText",
    required: true,
    stats: true,
  },
  {
    id: "gratitude",
    label: "What are you grateful for today?",
    type: "longText",
    required: true,
    stats: true,
  },
  {
    id: "hard-moment",
    label: "What was hard today, and how did you meet it?",
    type: "longText",
    required: true,
    stats: true,
  },
  {
    id: "small-win",
    label: "What small win are you proud of today?",
    type: "longText",
    required: true,
    stats: true,
  },
  {
    id: "who-mattered",
    label: "Who mattered to you today, and why?",
    type: "longText",
    required: true,
    stats: true,
  },
  {
    id: "do-differently",
    label: "What would you do differently if you could redo today?",
    type: "longText",
    required: true,
    stats: true,
  },
  {
    id: "body-energy",
    label: "How did your body and energy feel today?",
    type: "longText",
    required: true,
    stats: true,
  },
  {
    id: "tomorrow-line",
    label: "One line for tomorrow: what do you want to remember?",
    type: "longText",
    required: true,
    stats: true,
  },
];

export const HFL_PACK: ContentPack = {
  id: "hfl",
  name: "Homework for Life",
  version: "3.0.0",
  description: "One random reflection plus optional mood and weather check-in.",
  hideFreeWrite: false,
  sections: [
    {
      id: "reflection",
      title: "Reflection",
      promptMode: "random",
      drawCount: 1,
      fields: HFL_PROMPTS,
      pool: HFL_PROMPTS,
    },
    {
      id: "check-in",
      title: "Check-in",
      promptMode: "fixed",
      fields: [
        { id: "mood", label: "Mood", type: "shortText", required: false },
        { id: "weather", label: "Weather", type: "shortText", required: false },
      ],
    },
  ],
};

/** Pack ids that are always upserted on launch and cannot be deleted. */
export const BUILT_IN_PACK_IDS = new Set(["hfl"]);

export function isBuiltInPack(id: string): boolean {
  return BUILT_IN_PACK_IDS.has(id);
}
