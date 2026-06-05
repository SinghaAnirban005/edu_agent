import {
  CopilotRuntime,
  GroqAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { createOpenAI } from "@ai-sdk/openai";
import { NextRequest } from "next/server";
import Groq from "groq-sdk";

export const runtime = "nodejs";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const MODEL = "openai/gpt-oss-20b";
const groqChatProvider = createOpenAI({
  baseURL: GROQ_BASE_URL,
  apiKey: process.env.GROQ_API_KEY ?? "",
  name: "groq",
});

class GroqChatAdapter extends GroqAdapter {
  constructor() {
    super({
      groq: new Groq({ apiKey: process.env.GROQ_API_KEY }),
      model: MODEL,
    });
  }

  getLanguageModel() {
    return groqChatProvider.chat(MODEL);
  }
}

const groqChatAdapter = new GroqChatAdapter();

export const POST = async (req: NextRequest) => {
  const copilotRuntime = new CopilotRuntime();

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: copilotRuntime,
    serviceAdapter: groqChatAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};