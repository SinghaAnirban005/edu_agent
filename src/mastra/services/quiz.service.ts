import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { chatCompletion } from "../../lib/groq";
import { setSessionData, getSessionData } from "../../lib/redis";
import { MCQQuestionSchema } from "../schema/quiz.schema";
import { buildQuizPrompt } from "../prompts/quiz.prompt";
import type { 
  LearningPlan, 
  LearningObjective, 
  MCQQuestion, 
  QuizState, 
  ObjectiveQuizState, 
  QuizAttempt 
} from "@/types";

export class quizService {
  /**
   * Leverages LLM context mapping to compile specific MCQs for a dedicated milestone objective.
   */
  static async generateMCQsForObjective(
    objective: LearningObjective,
    pdfContext: string,
    questionsPerObjective = 3
  ): Promise<MCQQuestion[]> {
    const prompt = buildQuizPrompt(objective, pdfContext, questionsPerObjective);
    const raw = await chatCompletion(
      [{ role: "user", content: prompt }],
      { jsonMode: true, temperature: 0.4 }
    );

    try {
      const parsed = JSON.parse(raw);
      return z.array(MCQQuestionSchema).parse(parsed.questions);
    } catch (e) {
      console.error(`[QuizService] Fallback applied for objective: ${objective.id}`, e);
      return [this.getFallbackQuestion(objective)];
    }
  }

  /**
   * Initializes the assessment structures, mapping telemetry schema tracks across Redis and database logs.
   */
  static async stepInitializeQuiz(sessionId: string): Promise<QuizState> {
    const session = await prisma.learningSession.findUniqueOrThrow({
      where: { id: sessionId },
    });

    const plan = session.learningPlan as unknown as LearningPlan;
    const pdfContext = session.rawText.slice(0, 10000);
    const objectiveQuizStates: ObjectiveQuizState[] = [];

    for (const objective of plan.objectives) {
      const questions = await this.generateMCQsForObjective(objective, pdfContext, 3);
      const attempts: Record<string, QuizAttempt> = {};

      for (const q of questions) {
        attempts[q.id] = {
          questionId: q.id,
          selectedOptionId: null,
          isCorrect: null,
          correctOnFirstTry: false,
          attempts: 0,
          hintsUsed: 0,
          completed: false,
        };
      }

      objectiveQuizStates.push({
        objectiveId: objective.id,
        objectiveTitle: objective.title,
        questions,
        attempts,
        completed: false,
        score: 0,
      });
    }

    const totalQuestions = objectiveQuizStates.reduce((sum, obj) => sum + obj.questions.length, 0);

    const quizState: QuizState = {
      currentObjectiveIndex: 0,
      objectives: objectiveQuizStates,
      totalFirstTryCorrect: 0,
      totalEventuallyCorrect: 0,
      totalQuestions,
      startedAt: new Date().toISOString(),
    };

    await Promise.all([
      prisma.learningSession.update({
        where: { id: sessionId },
        data: { quizState: quizState as any, workflowStatus: "QUIZ_ACTIVE" },
      }),
      setSessionData(sessionId, "quizState", quizState),
      prisma.sessionEvent.create({
        data: {
          sessionId,
          eventType: "quiz_started",
          payload: { totalQuestions, objectiveCount: plan.objectives.length } as any,
        },
      }),
    ]);

    return quizState;
  }

  /**
   * Submits and validates a student answer, mutating progression indicators over active states.
   */
  static async submitAnswer(
    sessionId: string,
    questionId: string,
    selectedOptionId: string
  ): Promise<{
    isCorrect: boolean;
    explanation: string;
    hint: string;
    nextAction: "next_question" | "next_objective" | "quiz_complete" | "retry";
    quizState: QuizState;
  }> {
    let quizState = await getSessionData<QuizState>(sessionId, "quizState");
    if (!quizState) {
      const session = await prisma.learningSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      quizState = session.quizState as unknown as QuizState;
    }
    if (!quizState) throw new Error("Quiz state context not instantiated.");

    const currentObj = quizState.objectives[quizState.currentObjectiveIndex];
    const question = currentObj.questions.find((q) => q.id === questionId);
    if (!question) throw new Error(`Question context ${questionId} missing.`);

    const attempt = currentObj.attempts[questionId];
    const isCorrect = selectedOptionId === question.correctOptionId;
    const isFirstSubmission = attempt.attempts === 0;

    attempt.attempts += 1;
    attempt.selectedOptionId = selectedOptionId;
    attempt.isCorrect = isCorrect;

    if (isCorrect) {
      attempt.completed = true;
      if (isFirstSubmission) {
        attempt.correctOnFirstTry = true;
        quizState.totalFirstTryCorrect += 1;
        quizState.totalEventuallyCorrect += 1;
      } else {
        attempt.correctOnFirstTry = false;
        quizState.totalEventuallyCorrect += 1;
      }
    }

    currentObj.attempts[questionId] = attempt;
    let nextAction: "next_question" | "next_objective" | "quiz_complete" | "retry" = "retry";

    if (isCorrect) {
      const allQuestionsComplete = currentObj.questions.every((q) => currentObj.attempts[q.id].completed);

      if (allQuestionsComplete) {
        currentObj.completed = true;
        const firstTryInObj = currentObj.questions.filter((q) => currentObj.attempts[q.id].correctOnFirstTry).length;
        currentObj.score = Math.round((firstTryInObj / currentObj.questions.length) * 100);

        if (quizState.currentObjectiveIndex < quizState.objectives.length - 1) {
          quizState.currentObjectiveIndex += 1;
          nextAction = "next_objective";
        } else {
          nextAction = "quiz_complete";
        }
      } else {
        nextAction = "next_question";
      }
    }

    await Promise.all([
      setSessionData(sessionId, "quizState", quizState),
      prisma.learningSession.update({
        where: { id: sessionId },
        data: { quizState: quizState as any },
      }),
      prisma.sessionEvent.create({
        data: {
          sessionId,
          eventType: "answer_submitted",
          payload: { questionId, selectedOptionId, isCorrect, isFirstSubmission, nextAction } as any,
        },
      }),
    ]);

    return {
      isCorrect,
      explanation: question.explanation,
      hint: question.hint,
      nextAction,
      quizState,
    };
  }

  private static getFallbackQuestion(objective: LearningObjective): MCQQuestion {
    return {
      id: `q_${objective.id}_1`,
      objectiveId: objective.id,
      objectiveTitle: objective.title,
      question: `What is the main focus of "${objective.title}"?`,
      options: [
        { id: "A", text: objective.keyTopics[0] ?? "Core concept" },
        { id: "B", text: "Unrelated topic" },
        { id: "C", text: "Something else entirely" },
        { id: "D", text: "None of the above" },
      ],
      correctOptionId: "A",
      explanation: `The main focus is ${objective.keyTopics[0] ?? "the core concept"} as described in the learning objective.`,
      hint: `Think about what ${objective.title} primarily covers.`,
      difficulty: objective.difficulty,
    };
  }
}