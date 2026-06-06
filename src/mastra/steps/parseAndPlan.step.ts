import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { planService } from "../services/plan.service";

export const parseAndPlanStep = createStep({
  id: "parse-and-plan",

  inputSchema: z.object({}),

  outputSchema: z.object({
    plan: z.any(),
    structuredContent: z.any(),
  }),

  execute: async ({ getInitData }) => {
    const { sessionId } = getInitData<{
      sessionId: string;
    }>();

    return await planService.stepParseAndPlan(sessionId);
  },
});