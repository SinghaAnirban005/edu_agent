import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../src/lib/prisma";
import { mastra } from "@/src/mastra";

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
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.workflowStatus !== "SUSPENDED_FOR_APPROVAL") {
      return NextResponse.json(
        {
          error: `Cannot resume workflow in status: ${session.workflowStatus}`,
        },
        { status: 409 }
      );
    }

    if (!session.workflowRunId) {
      return NextResponse.json(
        {
          error: "No workflow run associated with session",
        },
        { status: 409 }
      );
    }

    await prisma.sessionEvent.create({
      data: {
        sessionId,
        eventType:
          action === "approve"
            ? "plan_approved"
            : "plan_rejected",
        payload: {} as any,
      },
    });

    const workflow = mastra.getWorkflow("learningWorkflow");

    const run = await workflow.createRun({
      runId: session.workflowRunId,
    });

    await run.resume({
      resumeData: {
        approved: action === "approve",
      },
    });

    let attempts = 0;

    let updatedSession =
      await prisma.learningSession.findUniqueOrThrow({
        where: { id: sessionId },
      });

    while (
      updatedSession.workflowStatus !== "QUIZ_ACTIVE" &&
      updatedSession.workflowStatus !== "FAILED" &&
      attempts < 60
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      updatedSession =
        await prisma.learningSession.findUniqueOrThrow({
          where: { id: sessionId },
        });

      attempts++;
    }

    return NextResponse.json({
      success: true,
      status: updatedSession.workflowStatus,
      quizState: updatedSession.quizState,
      currentObjective:
        (updatedSession.quizState as any)?.objectives?.[
          (updatedSession.quizState as any)?.currentObjectiveIndex ?? 0
        ],
    });
  } catch (err) {
    console.error("[Resume] Error:", err);

    return NextResponse.json(
      {
        error: "Failed to resume workflow",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId required" },
      { status: 400 }
    );
  }

  const session = await prisma.learningSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      workflowStatus: true,
      learningPlan: true,
      quizState: true,
      sessionResult: true,
      structuredContent: true,
    },
  });

  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(session);
}