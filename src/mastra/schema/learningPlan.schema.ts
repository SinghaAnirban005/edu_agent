import { z } from "zod";

export const LearningObjectiveSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  keyTopics: z.array(z.string()),
});

export const LearningPlanSchema = z.object({
  objectives: z.array(LearningObjectiveSchema),
  estimatedMinutes: z.number(),
  overallDifficulty: z.enum(["beginner", "intermediate", "advanced"]),
  summary: z.string(),
});