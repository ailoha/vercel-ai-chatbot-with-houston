import { createOpenAI } from "@ai-sdk/openai";
import { createDataStreamResponse, streamText } from "ai";
import type { JSONValue } from "ai";
import { isAuthed } from "@/lib/auth";

// Allow long-running streaming responses on Vercel.
export const maxDuration = 120;

const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
});

function isReasoningModel(modelId: string) {
  return /(?:^|\/)(gpt-5|o[134])/i.test(modelId);
}

function shouldUseResponsesAPI(modelId: string, thinkingEnabled: boolean) {
  const setting = process.env.OPENAI_API_TYPE?.toLowerCase();
  if (setting === "responses") return true;
  if (setting === "auto") return thinkingEnabled && isReasoningModel(modelId);
  // Default: Chat Completions. Most OpenAI-compatible relays (CherryIN,
  // OpenRouter, etc.) implement /v1/chat/completions but not /v1/responses,
  // so defaulting to Chat Completions is the safest path.
  return false;
}

function describeError(error: unknown): string {
  if (!error) return "Unknown upstream error";

  // The AI SDK wraps upstream HTTP failures in an APICallError-like object.
  const candidate = error as {
    message?: string;
    statusCode?: number;
    responseBody?: string;
    cause?: unknown;
    data?: unknown;
  };

  const parts: string[] = [];
  if (typeof candidate.statusCode === "number") {
    parts.push(`HTTP ${candidate.statusCode}`);
  }
  if (typeof candidate.message === "string" && candidate.message.length > 0) {
    parts.push(candidate.message);
  }

  // Try to extract a nested upstream message from the response body.
  if (typeof candidate.responseBody === "string") {
    try {
      const parsed = JSON.parse(candidate.responseBody);
      const upstreamMsg =
        parsed?.error?.message ?? parsed?.error?.code ?? parsed?.message;
      if (typeof upstreamMsg === "string" && upstreamMsg.length > 0) {
        parts.push(upstreamMsg);
      }
    } catch {
      // Not JSON; fall back to a short slice of the raw body.
      const trimmed = candidate.responseBody.trim();
      if (trimmed.length > 0) parts.push(trimmed.slice(0, 300));
    }
  }

  if (
    candidate.cause &&
    candidate.cause instanceof Error &&
    candidate.cause.message
  ) {
    parts.push(candidate.cause.message);
  }

  if (parts.length === 0) {
    if (typeof error === "string") return error.slice(0, 500);
    try {
      return JSON.stringify(error).slice(0, 500);
    } catch {
      return "Unknown upstream error";
    }
  }

  // De-duplicate while preserving order, then cap length.
  const seen = new Set<string>();
  const unique = parts.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  return unique.join(" — ").slice(0, 500);
}

export async function POST(req: Request) {
  if (!isAuthed()) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { messages?: unknown; thinking?: unknown };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const messages = Array.isArray(payload.messages) ? payload.messages : null;
  if (!messages || messages.length === 0) {
    return new Response("Missing messages", { status: 400 });
  }

  const thinkingEnabled = payload.thinking === true;
  const modelId = process.env.OPENAI_MODEL ?? "gpt-4o";
  const useResponsesAPI = shouldUseResponsesAPI(modelId, thinkingEnabled);

  const model = useResponsesAPI ? openai.responses(modelId) : openai(modelId);

  const openaiOptions: Record<string, JSONValue> = {};
  // Apply reasoning effort whenever the user toggles "Thinking" on a
  // reasoning-capable model. This works on both the Chat Completions and
  // the Responses API; the latter additionally streams a visible summary.
  if (thinkingEnabled && isReasoningModel(modelId)) {
    openaiOptions.reasoningEffort =
      process.env.OPENAI_REASONING_EFFORT ?? "medium";
    if (useResponsesAPI) {
      openaiOptions.reasoningSummary =
        process.env.OPENAI_REASONING_SUMMARY ?? "detailed";
    }
  }

  const upstreamTimeoutMs = Number(
    process.env.UPSTREAM_TIMEOUT_MS ?? 110_000
  );

  return createDataStreamResponse({
    // Surface the real upstream error so the user can see why the request
    // failed (e.g. relay returned 404 for /responses, model not allowed,
    // body too large, etc.) instead of the default "An error occurred."
    onError: (error) => describeError(error),
    execute: (dataStream) => {
      const result = streamText({
        model,
        system:
          "You are HoustonAI, a helpful, articulate, and thoughtful assistant. Help the user solve problems clearly and effectively. Do not simply agree with the user; form your own judgment based on facts, logic, and context. If the user is wrong, incomplete, or overlooking a risk, explain it respectfully and directly. Answer with clear structure. Distinguish facts, assumptions, and opinions. For complex problems, break the issue into parts, identify constraints, compare options, and recommend a practical solution. It is acceptable to test, revise, and iterate when solving difficult or uncertain problems. Keep simple answers concise and complex answers sufficiently thorough. Ask clarifying questions only when necessary; otherwise make reasonable assumptions and state them. Ask the user to upload images, documents, logs, or screenshots when they would help. Be friendly but not flattering, direct but not rude, and precise rather than vague. Do not pretend to know what you are unsure about.",
        messages,
        abortSignal: AbortSignal.timeout(upstreamTimeoutMs),
        ...(Object.keys(openaiOptions).length > 0
          ? { providerOptions: { openai: openaiOptions } }
          : {}),
      });
      result.mergeIntoDataStream(dataStream, { sendReasoning: true });
    },
  });
}
