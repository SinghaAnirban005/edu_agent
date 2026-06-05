import { prisma } from "../../lib/prisma";
import { chatCompletion } from "../../lib/groq";
import { LearningPlanSchema } from "../schema/learningPlan.schema";
import { buildStructurePrompt } from "../prompts/structure.prompt";
import { buildPlanPrompt } from "../prompts/plan.prompt";
import type { LearningPlan } from "@/types";

export class planService {
  /**
   * Parses the raw document text and builds an adaptive learning curriculum.
   */
  static async stepParseAndPlan(sessionId: string): Promise<{
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

    const structurePrompt = buildStructurePrompt(truncatedText);
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

    const planPrompt = buildPlanPrompt(structuredContent, truncatedText);
    const planRaw = await chatCompletion(
      [{ role: "user", content: planPrompt }],
      { jsonMode: true, temperature: 0.2 }
    );

    let plan: LearningPlan;
    try {
      const parsed = JSON.parse(planRaw);
      plan = LearningPlanSchema.parse(parsed);
    } catch (e) {
      console.error("[PlanService] Plan validation fallback triggered:", e);
      plan = this.getFallbackPlan(structuredContent);
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

  /**
   * Suspends execution to await Human-in-the-Loop (HITL) manual approval.
   */
  static async stepSuspendForApproval(sessionId: string): Promise<void> {
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

  private static getFallbackPlan(structuredContent: any): LearningPlan {
    return {
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
}