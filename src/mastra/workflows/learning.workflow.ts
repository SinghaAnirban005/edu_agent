import { createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { parseAndPlanStep } from "../steps/parseAndPlan.step";
import { suspendForApprovalStep } from "../steps/suspendForApproval.step";
import { initializeQuizStep } from "../steps/initializeQuiz.step";

export const learningWorkflow = createWorkflow({
  id: "learning-workflow",

  inputSchema: z.object({
    sessionId: z.string(),
  }),

  outputSchema: z.object({
    quizState: z.any(),
  }),
})
  .then(parseAndPlanStep)
  .then(suspendForApprovalStep)
  .then(initializeQuizStep)
  .commit();