import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { quizService } from "../services/quiz.service";

export const initializeQuizStep = createStep({
  id: "initialize-quiz",

  inputSchema: z.object({}),

  outputSchema: z.object({
    quizState: z.any(),
  }),

  execute: async ({ getInitData }) => {
    const { sessionId } = getInitData<{
      sessionId: string;
    }>();

    const quizState = await quizService.stepInitializeQuiz(sessionId);

    return { quizState };
  },
});