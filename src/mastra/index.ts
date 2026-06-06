import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { learningWorkflow } from "./workflows/learning.workflow";

export const mastra = new Mastra({
  workflows: {
    learningWorkflow,
  },

  storage: new PostgresStore({
    id: "ai-learning-agent",
    connectionString: process.env.DATABASE_URL!,
  }),
});