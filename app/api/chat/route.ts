import { createOpenAI } from "@ai-sdk/openai";
import { createDataStreamResponse, streamText } from "ai";
import type { JSONValue } from "ai";
import { isAuthed } from "@/lib/auth";

const openai = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
  apiKey: process.env.OPENAI_API_KEY,
});

function shouldUseResponsesAPI(modelId: string) {
  const setting = process.env.OPENAI_API_TYPE?.toLowerCase();
  if (setting === "responses") return true;
  if (setting === "chat") return false;
  return /(?:^|\/)(gpt-5|o[134])/i.test(modelId);
}

export async function POST(req: Request) {
  if (!isAuthed()) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, thinking, previousResponseId } = await req.json();

  const modelId = process.env.OPENAI_MODEL ?? "gpt-4o";
  const useResponsesAPI = shouldUseResponsesAPI(modelId);

  const model = useResponsesAPI
    ? openai.responses(modelId)
    : openai(modelId);

  const openaiOptions: Record<string, JSONValue> = {};
  if (useResponsesAPI) {
    openaiOptions.store = true;
    if (typeof previousResponseId === "string" && previousResponseId) {
      openaiOptions.previousResponseId = previousResponseId;
    }
    if (thinking) {
      openaiOptions.reasoningEffort =
        process.env.OPENAI_REASONING_EFFORT ?? "medium";
      openaiOptions.reasoningSummary =
        process.env.OPENAI_REASONING_SUMMARY ?? "detailed";
    }
  }

  return createDataStreamResponse({
    execute: (dataStream) => {
      const result = streamText({
        model,
        system:
          "You are HoustonAI, a friendly, articulate, and helpful assistant. Answer thoroughly but keep responses focused. You can ask the user to upload images or documents if it could help you understand the problem better.",
        messages,
        ...(Object.keys(openaiOptions).length > 0
          ? { providerOptions: { openai: openaiOptions } }
          : {}),
        onFinish: ({ providerMetadata }) => {
          const id = (
            providerMetadata as
              | { openai?: { responseId?: string } }
              | undefined
          )?.openai?.responseId;
          if (typeof id === "string" && id.length > 0) {
            dataStream.writeMessageAnnotation({ responseId: id });
          }
        },
      });
      result.mergeIntoDataStream(dataStream, { sendReasoning: true });
    },
  });
}
