// app/api/copilotkit/route.ts
// import {
//   CopilotRuntime,
//   OpenAIAdapter,
//   copilotRuntimeNextJSAppRouterEndpoint,
// } from "@copilotkit/runtime";
// import { NextRequest } from "next/server";
// import OpenAI from "openai";

// const groqOpenAI = new OpenAI({ 
//   apiKey: process.env.GROQ_API_KEY,
//   baseURL: "https://api.groq.com/openai/v1" 
// });

// const serviceAdapter = new OpenAIAdapter({
//   openai: groqOpenAI as any, 
//   model: "llama-3.1-8b-instant", 
// });

// export const POST = async (req: NextRequest) => {
//   // 1. Clone the request so we can read the body
//   const body = await req.json();

//   // 2. SCRUBBING LOGIC: Remove 'reasoning' messages from the history
//   // Groq/OpenAI only allow: 'system', 'user', 'assistant', 'tool'
//   if (body.messages && Array.isArray(body.messages)) {
//     body.messages = body.messages.filter((msg: any) => msg.role !== "reasoning");
//   }

//   // 3. Re-create the request with the clean body
//   const modifiedReq = new NextRequest(req.url, {
//     method: "POST",
//     headers: req.headers,
//     body: JSON.stringify(body),
//   });

//   const runtime = new CopilotRuntime();

//   const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
//     runtime,
//     serviceAdapter,
//     endpoint: "/api/copilotkit",
//   });

//   return handleRequest(modifiedReq);
// };

// app/api/copilotkit/route.ts
// import {
//   CopilotRuntime,
//   OpenAIAdapter,
//   copilotRuntimeNextJSAppRouterEndpoint,
// } from "@copilotkit/runtime";
// import { NextRequest } from "next/server";
// import OpenAI from "openai";

// const groqOpenAI = new OpenAI({ 
//   apiKey: process.env.GROQ_API_KEY,
//   baseURL: "https://api.groq.com/openai/v1" 
// });

// // Create a custom adapter that overrides the default process method
// class GroqCompatibleAdapter extends OpenAIAdapter {
//   async process(request: any) {
//     console.log('process ', request)
//     // Scrub the messages array right before passing it to the model execution context
//     if (request && Array.isArray(request.messages)) {
//       request.messages = request.messages.filter(
//         (msg: any) => msg.role !== "reasoning"
//       );
//     }
//     return super.process(request);
//   }
// }

// const serviceAdapter = new GroqCompatibleAdapter({
//   openai: groqOpenAI as any, 
//   model: "openai/gpt-oss-20b", 
// });

// const runtime = new CopilotRuntime({
//   actions: [],
// });

// export const POST = async (req: NextRequest) => {
//   const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
//     runtime,
//     serviceAdapter,
//     endpoint: "/api/copilotkit",
//   });

//   return handleRequest(req);
// };

// app/api/copilotkit/route.ts
//
// CopilotKit runtime endpoint.
//
// Architecture note on context grounding:
//   Context is NOT injected server-side here. Instead, the frontend registers
//   session context via useCopilotReadable() hooks in the React tree. CopilotKit
//   serialises those entries and sends them in the GraphQL request payload under
//   `data.context[]`. The runtime then prepends them to the system message before
//   calling the LLM adapter.
//
//   This is the correct, supported pattern. Injecting context server-side via
//   CopilotRuntime({ instructions }) is only for static, per-deployment rules —
//   not for per-session dynamic content like PDF text.

// import {
//   CopilotRuntime,
//   GroqAdapter,
//   copilotRuntimeNextJSAppRouterEndpoint,
// } from "@copilotkit/runtime";
// import { NextRequest } from "next/server";
// import Groq from "groq-sdk";

// export const runtime = "nodejs";

// // GroqAdapter is created once per module — it's stateless (just wraps the SDK)
// const groqAdapter = new GroqAdapter({
//   groq: new Groq({ apiKey: process.env.GROQ_API_KEY }),
//   // mixtral-8x7b has a 32k context window — large enough to hold the full
//   // session context (structured PDF content + plan + quiz state) alongside the
//   // conversation history.
//   model: "llama-3.1-8b-instant",
// });

// export const POST = async (req: NextRequest) => {
//   // CopilotRuntime is instantiated per-request so it stays stateless and
//   // doesn't accumulate stale context from previous sessions.
//   const runtime = new CopilotRuntime();

//   const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
//     runtime,
//     serviceAdapter: groqAdapter,
//     endpoint: "/api/copilotkit",
//   });

//   return handleRequest(req);
// };


// app/api/copilotkit/route.ts
//
// ROOT CAUSE OF "Unknown request URL: POST /responses":
//
//   CopilotKit 1.59.x uses the AG-UI protocol. When a CopilotRuntime receives a
//   request, it calls serviceAdapter.getLanguageModel() to obtain an AI SDK
//   LanguageModel, then hands that to a BuiltInAgent.
//
//   GroqAdapter.getLanguageModel() calls:
//     createOpenAI({ baseURL, apiKey, ... })(modelId)
//
//   In @ai-sdk/openai 3.x (the version bundled by ai@6.x), calling the provider
//   as a function routes through createLanguageModel(), which defaults to
//   createResponsesModel() — returning an OpenAIResponsesLanguageModel that
//   sends requests to POST /responses. Groq does not implement that endpoint.
//
// THE FIX:
//   Call createOpenAI().chat(modelId) explicitly. The .chat() accessor returns
//   an OpenAIChatLanguageModel that sends requests to POST /chat/completions,
//   which Groq fully supports.
//
//   We implement this by building a thin custom adapter that wraps GroqAdapter
//   but overrides getLanguageModel() to use the .chat() path.

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
const MODEL = "llama-3.1-8b-instant";
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