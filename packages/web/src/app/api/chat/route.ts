import { streamText, convertToModelMessages } from "ai";
import { openai } from "@ai-sdk/openai";
import { rateLimit, getIPKey } from "@/lib/rate-limit";
import { buildSystemPrompt } from "@/lib/chat-system-prompt";
import { getPageContext } from "@/lib/chat-page-context";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const limited = rateLimit(getIPKey(request), 60_000, 20);
  if (limited) return limited;

  const { messages, pageContext } = await request.json();

  const contextString = pageContext ? getPageContext(pageContext) : undefined;
  const systemPrompt = buildSystemPrompt(contextString);

  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: systemPrompt,
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
}
