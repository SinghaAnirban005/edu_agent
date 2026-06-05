import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../src/lib/prisma"
import { planService } from "../../../src/mastra/workflows";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be under 10MB" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let rawText: string;
    try {
      const pdfData = await pdfParse(buffer);
      rawText = pdfData.text;
    } catch (parseErr) {
      console.error("[Upload] PDF parse error:", parseErr);
      return NextResponse.json(
        { error: "Failed to parse PDF. Please ensure it is a text-based PDF." },
        { status: 422 }
      );
    }

    if (!rawText || rawText.trim().length < 100) {
      return NextResponse.json(
        {
          error:
            "PDF appears to be empty or contains only images. Please upload a text-based PDF.",
        },
        { status: 422 }
      );
    }

    const session = await prisma.learningSession.create({
      data: {
        pdfFileName: file.name,
        rawText: rawText.trim(),
        structuredContent: {},
        workflowStatus: "PENDING",
      },
    });

    await prisma.sessionEvent.create({
      data: {
        sessionId: session.id,
        eventType: "upload",
        payload: {
          fileName: file.name,
          fileSize: file.size,
          textLength: rawText.length,
        } as any,
      },
    });

    // Parse & Plan
    let plan;
    let structuredContent;
    try {
      const result = await planService.stepParseAndPlan(session.id);
      plan = result.plan;
      structuredContent = result.structuredContent;
    } catch (err) {
      console.error("[Upload] Step 1 failed:", err);
      await prisma.learningSession.update({
        where: { id: session.id },
        data: { workflowStatus: "FAILED" },
      });
      return NextResponse.json(
        { error: "Failed to analyze PDF content. Please try again." },
        { status: 500 }
      );
    }

    // Suspend for HITL approval
    await planService.stepSuspendForApproval(session.id);

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      plan,
      lessonContent: rawText.substring(0, 30000),
      status: "SUSPENDED_FOR_APPROVAL",
    });
  } catch (err) {
    console.error("[Upload] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}
