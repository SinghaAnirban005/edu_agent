import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../src/lib/prisma";
import { quizService } from "../../../../src/mastra/workflows";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, action } = body as {
      sessionId: string;
      action: "approve" | "reject";
    };

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const session = await prisma.learningSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.workflowStatus !== "SUSPENDED_FOR_APPROVAL") {
      return NextResponse.json(
        {
          error: `Cannot resume workflow in status: ${session.workflowStatus}`,
        },
        { status: 409 }
      );
    }

    if (action === "reject") {
      await prisma.learningSession.update({
        where: { id: sessionId },
        data: { workflowStatus: "FAILED", planApproved: false },
      });
      return NextResponse.json({ success: true, status: "REJECTED" });
    }

    await prisma.learningSession.update({
      where: { id: sessionId },
      data: {
        planApproved: true,
        workflowStatus: "APPROVED",
      },
    });

    await prisma.sessionEvent.create({
      data: {
        sessionId,
        eventType: "plan_approved",
        payload: {} as any,
      },
    });

    // Initialize quiz
    const quizState = await quizService.stepInitializeQuiz(sessionId);

    return NextResponse.json({
      success: true,
      status: "QUIZ_ACTIVE",
      quizState,
      currentObjective:
        quizState.objectives[quizState.currentObjectiveIndex],
    });
  } catch (err) {
    console.error("[Resume] Error:", err);
    return NextResponse.json(
      { error: "Failed to resume workflow" },
      { status: 500 }
    );
  }
}

// GET: Poll session status
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  const session = await prisma.learningSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      pdfFileName: true,
      workflowStatus: true,
      learningPlan: true,
      planApproved: true,
      quizState: true,
      sessionResult: true,
      structuredContent: true,
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json(session);
}
