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

// Parse & Plan

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
    // Fallback plan
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

// HITL Suspend

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

// MCQ Generation

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
    totalCorrect: 0,
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

// Quiz State Mutation

export async function submitAnswer(
  sessionId: string,
  questionId: string,
  selectedOptionId: string
): Promise<{
  isCorrect: boolean;
  explanation: string;
  hint: string;
  nextAction:
    | "next_question"
    | "next_objective"
    | "quiz_complete"
    | "retry";
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

  attempt.attempts += 1;
  attempt.selectedOptionId = selectedOptionId;
  attempt.isCorrect = isCorrect;

  if (isCorrect) {
    attempt.completed = true;
    quizState.totalCorrect += 1;
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
      const correctInObj = currentObj.questions.filter(
        (q) => currentObj.attempts[q.id].isCorrect
      ).length;
      currentObj.score = Math.round(
        (correctInObj / currentObj.questions.length) * 100
      );

      if (
        quizState.currentObjectiveIndex <
        quizState.objectives.length - 1
      ) {
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
      payload: {
        questionId,
        selectedOptionId,
        isCorrect,
        nextAction,
      } as any,
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

// Session Summary

export async function generateSessionSummary(
  sessionId: string,
  quizState: QuizState
): Promise<SessionResult> {
  const scorePercent = Math.round(
    (quizState.totalCorrect / quizState.totalQuestions) * 100
  );

  const objectiveScores = quizState.objectives.map((obj) => {
    const correct = obj.questions.filter(
      (q) => obj.attempts[q.id]?.isCorrect
    ).length;
    return {
      objectiveTitle: obj.objectiveTitle,
      correct,
      total: obj.questions.length,
      scorePercent: Math.round((correct / obj.questions.length) * 100),
    };
  });

  const weakObjectives = objectiveScores
    .filter((o) => o.scorePercent < 70)
    .map((o) => o.objectiveTitle);

  const summaryPrompt = `You are a supportive educator summarizing a student's learning session.

OVERALL SCORE: ${scorePercent}% (${quizState.totalCorrect}/${quizState.totalQuestions} correct)
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
      overallFeedback: `You scored ${scorePercent}%. Keep practicing to strengthen your understanding.`,
    };
  }

  const result: SessionResult = {
    totalCorrect: quizState.totalCorrect,
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
      payload: { scorePercent } as any,
    },
  });

  return result;
}

// Hint Generation

export async function generateContextualHint(
  question: MCQQuestion,
  userQuestion: string,
  previousAttempts: number
): Promise<string> {
  const prompt = `You are a Socratic tutor helping a student with a quiz question WITHOUT revealing the answer.

QUIZ QUESTION: ${question.question}
OPTIONS: ${question.options.map((o) => `${o.id}: ${o.text}`).join(", ")}
STUDENT'S QUESTION: "${userQuestion}"
PREVIOUS ATTEMPTS: ${previousAttempts}

Provide a helpful hint that:
1. Guides them toward the correct reasoning WITHOUT stating which option is correct
2. Addresses their specific question
3. Encourages them to think critically
4. Gently reminds them to continue with the quiz when appropriate

Keep the response under 3 sentences. Be warm, encouraging, and pedagogically sound.`;

  return await chatCompletion(
    [{ role: "user", content: prompt }],
    { temperature: 0.6, maxTokens: 256, model: "llama-3.1-8b-instant" }
  );
}
