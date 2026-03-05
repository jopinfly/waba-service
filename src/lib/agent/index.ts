import Anthropic from "@anthropic-ai/sdk";
import { config } from "@/config";
import { agentTools, executeTool, type ToolContext } from "./tools";
import { buildSystemPrompt } from "./system-prompt";
import {
  getClaudeContext,
  saveClaudeContext,
  getConversation,
} from "../db/queries";
import { extractTextContent } from "../whatsapp/webhook";
import type { InboundMessage } from "../whatsapp/types";

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const MAX_CONTEXT_MESSAGES = 40;
const MAX_AGENTIC_TURNS = 5;

export interface AgentResponse {
  textReply: string | null;
  toolsUsed: string[];
}

export async function processMessage(
  message: InboundMessage,
  conversationId: string
): Promise<AgentResponse> {
  const conversation = await getConversation(conversationId);
  const systemPrompt = buildSystemPrompt(
    conversation?.systemPromptOverride
  );

  const claudeContext = await getClaudeContext(conversationId);
  const existingMessages: Anthropic.MessageParam[] =
    (claudeContext?.messages as Anthropic.MessageParam[]) || [];

  const userContent = buildUserContent(message);

  const claudeMessages: Anthropic.MessageParam[] = [
    ...existingMessages.slice(-MAX_CONTEXT_MESSAGES),
    { role: "user", content: userContent },
  ];

  const toolContext: ToolContext = {
    to: message.from,
    conversationId,
  };

  const { responseText, toolsUsed, finalMessages } = await runAgentLoop(
    systemPrompt,
    claudeMessages,
    toolContext
  );

  await saveClaudeContext(conversationId, finalMessages);

  return {
    textReply: responseText,
    toolsUsed,
  };
}

function buildUserContent(
  message: InboundMessage
): string | Anthropic.ContentBlockParam[] {
  const textContent = extractTextContent(message);

  const metaParts: string[] = [];
  metaParts.push(`[WhatsApp message_id: ${message.id}]`);
  metaParts.push(`[From: ${message.from}]`);
  metaParts.push(`[Type: ${message.type}]`);

  if (message.context) {
    metaParts.push(`[Reply to message: ${message.context.id}]`);
  }

  const metaPrefix = metaParts.join(" ");

  return `${metaPrefix}\n${textContent}`;
}

async function runAgentLoop(
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  toolContext: ToolContext
): Promise<{
  responseText: string | null;
  toolsUsed: string[];
  finalMessages: Anthropic.MessageParam[];
}> {
  const toolsUsed: string[] = [];
  let currentMessages = [...messages];

  for (let turn = 0; turn < MAX_AGENTIC_TURNS; turn++) {
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: config.anthropic.maxTokens,
      system: systemPrompt,
      tools: agentTools,
      messages: currentMessages,
    });

    currentMessages.push({
      role: "assistant",
      content: response.content,
    });

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );

      return {
        responseText: textBlock?.text || null,
        toolsUsed,
        finalMessages: currentMessages,
      };
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolBlock of toolUseBlocks) {
        toolsUsed.push(toolBlock.name);
        const result = await executeTool(
          toolBlock.name,
          toolBlock.input as Record<string, unknown>,
          toolContext
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: result,
        });
      }

      currentMessages.push({
        role: "user",
        content: toolResults,
      });

      continue;
    }

    // For any other stop reason, extract text and return
    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );

    return {
      responseText: textBlock?.text || null,
      toolsUsed,
      finalMessages: currentMessages,
    };
  }

  // Exceeded max turns - return what we have
  return {
    responseText:
      "I apologize, but I'm having trouble processing your request. Could you please try again?",
    toolsUsed,
    finalMessages: currentMessages,
  };
}
