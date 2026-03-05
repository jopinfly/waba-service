import Anthropic from "@anthropic-ai/sdk";
import { whatsappClient } from "../whatsapp/client";
import type { SendMessageResponse } from "../whatsapp/types";
import { saveOutboundMessage } from "../db/queries";

// ============================================================
// Tool Definitions
// ============================================================

export const agentTools: Anthropic.Tool[] = [
  {
    name: "send_interactive_buttons",
    description:
      "Send an interactive message with up to 3 quick-reply buttons. Use this when you want to give the user a small set of choices.",
    input_schema: {
      type: "object" as const,
      properties: {
        body_text: {
          type: "string",
          description: "The main message body text",
        },
        buttons: {
          type: "array",
          description: "Array of buttons (max 3)",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique button ID" },
              title: {
                type: "string",
                description: "Button label (max 20 chars)",
              },
            },
            required: ["id", "title"],
          },
        },
        header_text: {
          type: "string",
          description: "Optional header text",
        },
        footer_text: {
          type: "string",
          description: "Optional footer text",
        },
      },
      required: ["body_text", "buttons"],
    },
  },
  {
    name: "send_interactive_list",
    description:
      "Send an interactive list message with sections and rows. Use this when presenting multiple options (up to 10 total rows).",
    input_schema: {
      type: "object" as const,
      properties: {
        body_text: {
          type: "string",
          description: "The main message body text",
        },
        button_label: {
          type: "string",
          description: "The label for the list button (max 20 chars)",
        },
        sections: {
          type: "array",
          description: "List sections",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Section title" },
              rows: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "Row ID" },
                    title: {
                      type: "string",
                      description: "Row title (max 24 chars)",
                    },
                    description: {
                      type: "string",
                      description: "Row description (max 72 chars)",
                    },
                  },
                  required: ["id", "title"],
                },
              },
            },
            required: ["title", "rows"],
          },
        },
        header_text: { type: "string", description: "Optional header text" },
        footer_text: { type: "string", description: "Optional footer text" },
      },
      required: ["body_text", "button_label", "sections"],
    },
  },
  {
    name: "send_reaction",
    description:
      "React to a user's message with an emoji. Use this to acknowledge messages with a reaction.",
    input_schema: {
      type: "object" as const,
      properties: {
        message_id: {
          type: "string",
          description: "The WhatsApp message ID to react to",
        },
        emoji: {
          type: "string",
          description: "The emoji to react with (single emoji character)",
        },
      },
      required: ["message_id", "emoji"],
    },
  },
  {
    name: "send_location",
    description: "Send a location pin to the user.",
    input_schema: {
      type: "object" as const,
      properties: {
        latitude: { type: "number", description: "Latitude" },
        longitude: { type: "number", description: "Longitude" },
        name: { type: "string", description: "Location name" },
        address: { type: "string", description: "Location address" },
      },
      required: ["latitude", "longitude"],
    },
  },
];

// ============================================================
// Tool Executor
// ============================================================

export interface ToolContext {
  to: string;
  conversationId: string;
}

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  try {
    switch (toolName) {
      case "send_interactive_buttons":
        return await executeInteractiveButtons(toolInput, context);
      case "send_interactive_list":
        return await executeInteractiveList(toolInput, context);
      case "send_reaction":
        return await executeReaction(toolInput, context);
      case "send_location":
        return await executeSendLocation(toolInput, context);
      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Tool execution failed: ${message}`;
  }
}

async function executeInteractiveButtons(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const buttons = (input.buttons as Array<{ id: string; title: string }>).slice(
    0,
    3
  );
  const result = await whatsappClient.sendInteractiveButtons(
    context.to,
    input.body_text as string,
    buttons,
    input.header_text as string | undefined,
    input.footer_text as string | undefined
  );

  await trackOutbound(context, result, "interactive", input);
  return `Sent interactive buttons to ${context.to}`;
}

async function executeInteractiveList(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const result = await whatsappClient.sendInteractiveList(
    context.to,
    input.body_text as string,
    input.button_label as string,
    input.sections as Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    input.header_text as string | undefined,
    input.footer_text as string | undefined
  );

  await trackOutbound(context, result, "interactive", input);
  return `Sent interactive list to ${context.to}`;
}

async function executeReaction(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  await whatsappClient.sendReaction(
    context.to,
    input.message_id as string,
    input.emoji as string
  );
  return `Reacted with ${input.emoji}`;
}

async function executeSendLocation(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<string> {
  const result = await whatsappClient.sendLocation(
    context.to,
    input.latitude as number,
    input.longitude as number,
    input.name as string | undefined,
    input.address as string | undefined
  );

  await trackOutbound(context, result, "location", input);
  return `Sent location to ${context.to}`;
}

async function trackOutbound(
  context: ToolContext,
  result: SendMessageResponse,
  type: string,
  content: Record<string, unknown>
) {
  if (result.messages?.[0]?.id) {
    await saveOutboundMessage(
      context.conversationId,
      result.messages[0].id,
      type,
      content
    );
  }
}
