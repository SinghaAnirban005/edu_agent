import { z } from "zod";
import { chatCompletion, GROQ_MODEL } from "../../lib/groq";
import { prisma } from "../../lib/prisma";
import { setSessionData, getSessionData } from "../../lib/redis";
import type {
  LearningPlan,
  LearningObjective,
  MCQQuestion,
  MCQOption,
  ObjectiveQuizState,
  QuizState,
  SessionResult,
  QuizAttempt,
} from "@/types";

// Zod Schemas

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

// ─── Step 1: Parse & Plan ─────────────────────────────────────────────────────

export async function stepParseAndPlan(sessionId: string): Promise<{
  plan: LearningPlan;
  structuredContent: { title: string; summary: string; keyPoints: string[] };
}> {
  const session = await prisma.learningSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  const truncatedText = session.rawText.slice(0, 12000);

  await prisma.learningSession.update({
    where: { id: sessionId },
    data: { workflowStatus: "PARSING" },
  });

  const structurePrompt = `You are an expert educational content analyst. Analyze the following PDF text and extract structured information.

PDF CONTENT:
"""
${truncatedText}
"""

Return a JSON object with this EXACT shape (no markdown, just raw JSON):
{
  "title": "document title or inferred topic",
  "summary": "2-3 sentence summary of the document",
  "keyPoints": ["key concept 1", "key concept 2", "key concept 3", "key concept 4", "key concept 5"]
}`;

  const structureRaw = await chatCompletion(
    [{ role: "user", content: structurePrompt }],
    { jsonMode: true, temperature: 0.1 }
  );

  let structuredContent: { title: string; summary: string; keyPoints: string[] };
  try {
    structuredContent = JSON.parse(structureRaw);
  } catch {
    structuredContent = {
      title: "Learning Document",
      summary: "A document for learning.",
      keyPoints: ["Key concept from the document"],
    };
  }

  const planPrompt = `You are an expert curriculum designer. Based on this document content, create a structured learning plan.

DOCUMENT TITLE: ${structuredContent.title}
DOCUMENT SUMMARY: ${structuredContent.summary}
KEY POINTS: ${structuredContent.keyPoints.join(", ")}

TRUNCATED PDF TEXT:
"""
${truncatedText.slice(0, 6000)}
"""

Create a learning plan with 3-5 clear learning objectives. Each objective should be testable with multiple-choice questions.

Return ONLY a valid JSON object with this EXACT shape:
{
  "objectives": [
    {
      "id": "obj_1",
      "title": "Short objective title",
      "description": "Clear description of what student will learn",
      "difficulty": "beginner|intermediate|advanced",
      "keyTopics": ["topic1", "topic2", "topic3"]
    }
  ],
  "estimatedMinutes": 25,
  "overallDifficulty": "beginner|intermediate|advanced",
  "summary": "Brief overview of what this lesson covers"
}`;

  const planRaw = await chatCompletion(
    [{ role: "user", content: planPrompt }],
    { jsonMode: true, temperature: 0.2 }
  );

  let plan: LearningPlan;
  try {
    const parsed = JSON.parse(planRaw);
    plan = LearningPlanSchema.parse(parsed);
  } catch (e) {
    console.error("[Workflow] Plan parse error:", e);
    plan = {
      objectives: [
        {
          id: "obj_1",
          title: "Core Concepts",
          description: "Understand the fundamental concepts presented in the document",
          difficulty: "intermediate",
          keyTopics: structuredContent.keyPoints.slice(0, 3),
        },
        {
          id: "obj_2",
          title: "Key Applications",
          description: "Apply the knowledge from the document to practical scenarios",
          difficulty: "intermediate",
          keyTopics: structuredContent.keyPoints.slice(3),
        },
      ],
      estimatedMinutes: 20,
      overallDifficulty: "intermediate",
      summary: structuredContent.summary,
    };
  }

  await prisma.learningSession.update({
    where: { id: sessionId },
    data: {
      structuredContent: structuredContent as any,
      learningPlan: plan as any,
      workflowStatus: "PLAN_READY",
    },
  });

  await prisma.sessionEvent.create({
    data: {
      sessionId,
      eventType: "plan_generated",
      payload: { objectiveCount: plan.objectives.length } as any,
    },
  });

  return { plan, structuredContent };
}

// ─── Step 2: HITL Suspend ─────────────────────────────────────────────────────

export async function stepSuspendForApproval(sessionId: string): Promise<void> {
  await prisma.learningSession.update({
    where: { id: sessionId },
    data: { workflowStatus: "SUSPENDED_FOR_APPROVAL" },
  });

  await prisma.workflowSnapshot.upsert({
    where: { runId: sessionId },
    create: {
      runId: sessionId,
      sessionId,
      snapshot: { status: "suspended", step: "approval" } as any,
      stepId: "step_approval",
    },
    update: {
      snapshot: { status: "suspended", step: "approval" } as any,
      stepId: "step_approval",
      updatedAt: new Date(),
    },
  });
}

// ─── Step 3: MCQ Generation ───────────────────────────────────────────────────

export async function generateMCQsForObjective(
  sessionId: string,
  objective: LearningObjective,
  pdfContext: string,
  questionsPerObjective = 3
): Promise<MCQQuestion[]> {
  const prompt = `You are an expert educator creating a multiple-choice quiz.

LEARNING OBJECTIVE: ${objective.title}
OBJECTIVE DESCRIPTION: ${objective.description}
KEY TOPICS: ${objective.keyTopics.join(", ")}
DIFFICULTY: ${objective.difficulty}

RELEVANT CONTENT:
"""
${pdfContext.slice(0, 4000)}
"""

Generate exactly ${questionsPerObjective} multiple-choice questions testing this objective.
Each question must have exactly 4 options (A, B, C, D), one correct answer, a hint that doesn't give away the answer, and a clear explanation.

Return ONLY valid JSON with this EXACT shape:
{
  "questions": [
    {
      "id": "q_${objective.id}_1",
      "objectiveId": "${objective.id}",
      "objectiveTitle": "${objective.title}",
      "question": "The question text here?",
      "options": [
        {"id": "A", "text": "Option A text"},
        {"id": "B", "text": "Option B text"},
        {"id": "C", "text": "Option C text"},
        {"id": "D", "text": "Option D text"}
      ],
      "correctOptionId": "A",
      "explanation": "Detailed explanation of why A is correct and others are wrong.",
      "hint": "A subtle hint that points toward the answer without revealing it.",
      "difficulty": "${objective.difficulty}"
    }
  ]
}`;

  const raw = await chatCompletion(
    [{ role: "user", content: prompt }],
    { jsonMode: true, temperature: 0.4 }
  );

  try {
    const parsed = JSON.parse(raw);
    const questions = z.array(MCQQuestionSchema).parse(parsed.questions);
    return questions;
  } catch (e) {
    console.error("[Workflow] MCQ parse error for objective:", objective.id, e);
    return [
      {
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
      },
    ];
  }
}

export async function stepInitializeQuiz(sessionId: string): Promise<QuizState> {
  const session = await prisma.learningSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  const plan = session.learningPlan as unknown as LearningPlan;
  const pdfContext = session.rawText.slice(0, 10000);

  const objectiveQuizStates: ObjectiveQuizState[] = [];

  for (const objective of plan.objectives) {
    const questions = await generateMCQsForObjective(
      sessionId,
      objective,
      pdfContext,
      3
    );

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

  const totalQuestions = objectiveQuizStates.reduce(
    (sum, obj) => sum + obj.questions.length,
    0
  );

  const quizState: QuizState = {
    currentObjectiveIndex: 0,
    objectives: objectiveQuizStates,
    totalFirstTryCorrect: 0,
    totalEventuallyCorrect: 0,
    totalQuestions,
    startedAt: new Date().toISOString(),
  };

  await prisma.learningSession.update({
    where: { id: sessionId },
    data: {
      quizState: quizState as any,
      workflowStatus: "QUIZ_ACTIVE",
    },
  });

  await setSessionData(sessionId, "quizState", quizState);

  await prisma.sessionEvent.create({
    data: {
      sessionId,
      eventType: "quiz_started",
      payload: { totalQuestions, objectiveCount: plan.objectives.length } as any,
    },
  });

  return quizState;
}

export async function submitAnswer(
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
  if (!quizState) throw new Error("Quiz state not found");

  const currentObj = quizState.objectives[quizState.currentObjectiveIndex];
  const question = currentObj.questions.find((q) => q.id === questionId);
  if (!question) throw new Error(`Question ${questionId} not found`);

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

  let nextAction: "next_question" | "next_objective" | "quiz_complete" | "retry";

  if (!isCorrect) {
    nextAction = "retry";
  } else {
    const allQuestionsComplete = currentObj.questions.every(
      (q) => currentObj.attempts[q.id].completed
    );

    if (allQuestionsComplete) {
      currentObj.completed = true;

      const firstTryInObj = currentObj.questions.filter(
        (q) => currentObj.attempts[q.id].correctOnFirstTry
      ).length;
      currentObj.score = Math.round(
        (firstTryInObj / currentObj.questions.length) * 100
      );

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

  await setSessionData(sessionId, "quizState", quizState);
  await prisma.learningSession.update({
    where: { id: sessionId },
    data: { quizState: quizState as any },
  });

  await prisma.sessionEvent.create({
    data: {
      sessionId,
      eventType: "answer_submitted",
      payload: { questionId, selectedOptionId, isCorrect, isFirstSubmission, nextAction } as any,
    },
  });

  return {
    isCorrect,
    explanation: question.explanation,
    hint: question.hint,
    nextAction,
    quizState,
  };
}

export async function generateSessionSummary(
  sessionId: string,
  quizState: QuizState
): Promise<SessionResult> {
  const scorePercent = quizState.totalQuestions > 0
    ? Math.round((quizState.totalFirstTryCorrect / quizState.totalQuestions) * 100)
    : 0;

  const objectiveScores = quizState.objectives.map((obj) => {
    const firstTryCorrect = obj.questions.filter(
      (q) => obj.attempts[q.id]?.correctOnFirstTry
    ).length;
    const eventuallyCorrect = obj.questions.filter(
      (q) => obj.attempts[q.id]?.completed && obj.attempts[q.id]?.isCorrect
    ).length;
    const totalAttempts = obj.questions.reduce(
      (sum, q) => sum + (obj.attempts[q.id]?.attempts ?? 0),
      0
    );
    const avgAttempts = obj.questions.length > 0
      ? Math.round((totalAttempts / obj.questions.length) * 10) / 10
      : 1;

    return {
      objectiveTitle: obj.objectiveTitle,
      firstTryCorrect,
      eventuallyCorrect,
      total: obj.questions.length,
      scorePercent: obj.questions.length > 0
        ? Math.round((firstTryCorrect / obj.questions.length) * 100)
        : 0,
      avgAttempts,
    };
  });

  const weakObjectives = objectiveScores
    .filter((o) => o.scorePercent < 70)
    .map((o) => o.objectiveTitle);

  const summaryPrompt = `You are a supportive educator summarizing a student's learning session.

SCORE: ${scorePercent}% first-try accuracy (${quizState.totalFirstTryCorrect}/${quizState.totalQuestions} correct on first attempt)
EVENTUALLY CORRECT: ${quizState.totalEventuallyCorrect}/${quizState.totalQuestions} (includes retries)
WEAK AREAS: ${weakObjectives.length > 0 ? weakObjectives.join(", ") : "None — great performance!"}

Generate personalized study tips and feedback. Return ONLY valid JSON:
{
  "studyTips": ["Tip 1", "Tip 2", "Tip 3"],
  "overallFeedback": "2-3 sentence personalized feedback message"
}`;

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

  await prisma.learningSession.update({
    where: { id: sessionId },
    data: {
      sessionResult: result as any,
      workflowStatus: "COMPLETE",
    },
  });

  await prisma.sessionEvent.create({
    data: {
      sessionId,
      eventType: "session_complete",
      payload: { scorePercent, firstTryCorrect: quizState.totalFirstTryCorrect } as any,
    },
  });

  return result;
}

