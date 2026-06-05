import { prisma } from "../../lib/prisma";
import { chatCompletion } from "../../lib/groq";
import { buildSummaryPrompt } from "../prompts/summary.prompt";
import type { QuizState, SessionResult } from "@/types";

export class reportingService {
  /**
   * Resolves aggregated telemetry across modules to present contextual diagnostic recaps.
   */
  static async generateSessionSummary(sessionId: string, quizState: QuizState): Promise<SessionResult> {
    const scorePercent = quizState.totalQuestions > 0
      ? Math.round((quizState.totalFirstTryCorrect / quizState.totalQuestions) * 100)
      : 0;

    const objectiveScores = quizState.objectives.map((obj) => {
      const firstTryCorrect = obj.questions.filter((q) => obj.attempts[q.id]?.correctOnFirstTry).length;
      const eventuallyCorrect = obj.questions.filter((q) => obj.attempts[q.id]?.completed && obj.attempts[q.id]?.isCorrect).length;
      const totalAttempts = obj.questions.reduce((sum, q) => sum + (obj.attempts[q.id]?.attempts ?? 0), 0);
      const avgAttempts = obj.questions.length > 0 ? Math.round((totalAttempts / obj.questions.length) * 10) / 10 : 1;

      return {
        objectiveTitle: obj.objectiveTitle,
        firstTryCorrect,
        eventuallyCorrect,
        total: obj.questions.length,
        scorePercent: obj.questions.length > 0 ? Math.round((firstTryCorrect / obj.questions.length) * 100) : 0,
        avgAttempts,
      };
    });

    const weakObjectives = objectiveScores.filter((o) => o.scorePercent < 70).map((o) => o.objectiveTitle);
    const summaryPrompt = buildSummaryPrompt(scorePercent, weakObjectives, quizState);

    const raw = await chatCompletion(
      [{ role: "user", content: summaryPrompt }],
      { jsonMode: true, temperature: 0.5 }
    );

    let aiSummary: { studyTips: string[]; overallFeedback: string };
    try {
      aiSummary = JSON.parse(raw);
    } catch {
      aiSummary = {
        studyTips: [
          "Review the concepts you found challenging",
          "Practice with additional examples",
          "Revisit the source material for unclear topics",
        ],
        overallFeedback: `You scored ${scorePercent}% on first attempts. Keep practicing to sharpen your recall.`,
      };
    }

    const result: SessionResult = {
      firstTryCorrect: quizState.totalFirstTryCorrect,
      eventuallyCorrect: quizState.totalEventuallyCorrect,
      totalQuestions: quizState.totalQuestions,
      scorePercent,
      objectiveScores,
      studyTips: aiSummary.studyTips,
      overallFeedback: aiSummary.overallFeedback,
      completedAt: new Date().toISOString(),
    };

    await Promise.all([
      prisma.learningSession.update({
        where: { id: sessionId },
        data: { sessionResult: result as any, workflowStatus: "COMPLETE" },
      }),
      prisma.sessionEvent.create({
        data: {
          sessionId,
          eventType: "session_complete",
          payload: { scorePercent, firstTryCorrect: quizState.totalFirstTryCorrect } as any,
        },
      }),
    ]);

    return result;
  }
}