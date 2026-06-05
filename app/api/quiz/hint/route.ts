import { NextRequest, NextResponse } from "next/server";
import { generateContextualHint } from "../../../../src/mastra/workflows";
import { getSessionData } from "../../../../src/lib/redis"
import { prisma } from "../../../../src/lib/prisma"
import type { QuizState, MCQQuestion } from "@/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, questionId, userQuestion, previousAttempts } =
      body as {
        sessionId: string;
        questionId: string;
        userQuestion: string;
        previousAttempts: number;
      };

    if (!sessionId || !questionId) {
      return NextResponse.json(
        { error: "sessionId and questionId are required" },
        { status: 400 }
      );
    }

    let quizState = await getSessionData<QuizState>(sessionId, "quizState");
    if (!quizState) {
      const session = await prisma.learningSession.findUnique({
        where: { id: sessionId },
      });
      quizState = session?.quizState as unknown as QuizState;
    }

    if (!quizState) {
      return NextResponse.json(
        { error: "Quiz state not found" },
        { status: 404 }
      );
    }

    let question: MCQQuestion | undefined;
    for (const obj of quizState.objectives) {
      question = obj.questions.find((q) => q.id === questionId);
      if (question) break;
    }

    if (!question) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }

    const hint = await generateContextualHint(
      question,
      userQuestion || "Can you give me a hint?",
      previousAttempts || 0
    );

    return NextResponse.json({ hint });
  } catch (err: any) {
    console.error("[Hint] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
