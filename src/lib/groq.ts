import Groq from "groq-sdk";

const globalForGroq = globalThis as unknown as {
  groqClient: Groq | undefined;
};

export const groq =
  globalForGroq.groqClient ??
  new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

if (process.env.NODE_ENV !== "production") globalForGroq.groqClient = groq;

export const GROQ_MODEL = "llama-3.1-8b-instant";
export const GROQ_FAST_MODEL = "mixtral-8x7b-32768";

export async function chatCompletion(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
  } = {}
): Promise<string> {
  const {
    model = GROQ_MODEL,
    temperature = 0.3,
    maxTokens = 4096,
    jsonMode = false,
  } = options;

  const response = await groq.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
  });

  return response.choices[0]?.message?.content ?? "";
}
