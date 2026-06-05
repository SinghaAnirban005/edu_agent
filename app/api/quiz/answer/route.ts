import { NextRequest, NextResponse } from "next/server";
import { submitAnswer, generateSessionSummary } from "../../../../src/mastra/workflows";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, questionId, selectedOptionId } = body as {
      sessionId: string;
      questionId: string;
      selectedOptionId: string;
    };

    if (!sessionId || !questionId || !selectedOptionId) {
      return NextResponse.json(
        { error: "sessionId, questionId, and selectedOptionId are required" },
        { status: 400 }
      );
    }

    const result = await submitAnswer(sessionId, questionId, selectedOptionId);

    if (result.nextAction === "quiz_complete") {
      const summary = await generateSessionSummary(
        sessionId,
        result.quizState
      );
      return NextResponse.json({ ...result, summary });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[Answer] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
