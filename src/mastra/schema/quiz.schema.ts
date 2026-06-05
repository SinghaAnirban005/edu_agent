import { z } from "zod";

export const MCQOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export const MCQQuestionSchema = z.object({
  id: z.string(),
  objectiveId: z.string(),
  objectiveTitle: z.string(),
  question: z.string(),
  options: z.array(MCQOptionSchema),
  correctOptionId: z.string(),
  explanation: z.string(),
  hint: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
});