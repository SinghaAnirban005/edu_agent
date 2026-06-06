import { createStep } from "@mastra/core/workflows";
import { z } from "zod";
import { prisma } from "../../lib/prisma";

const ApprovalResumeSchema = z.object({
  approved: z.boolean(),
});

export const suspendForApprovalStep = createStep({
  id: "suspend-for-approval",

  inputSchema: z.any(),

  outputSchema: z.object({
    approved: z.boolean(),
  }),

  suspendSchema: z.object({
    sessionId: z.string(),
    step: z.literal("approval"),
  }),

  resumeSchema: ApprovalResumeSchema,

  execute: async ({ getInitData, suspend, resumeData }) => {
  const { sessionId } = getInitData<{ sessionId: string }>();

  console.log("resumeData:", resumeData);

  // First execution
  if (!resumeData) {
    await prisma.learningSession.update({
      where: { id: sessionId },
      data: {
        workflowStatus: "SUSPENDED_FOR_APPROVAL",
      },
    });

    await suspend({
      sessionId,
      step: "approval",
    });

    return {
      approved: false,
    };
  }

  const data = z
    .object({
      approved: z.boolean(),
    })
    .parse(resumeData);

  if (!data.approved) {
    throw new Error("Plan rejected by user");
  }

  return {
    approved: true,
  };
}
});