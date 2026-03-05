import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import {
  verifyWebhookChallenge,
  parseWebhookPayload,
  type ParsedMessageEvent,
  type ParsedStatusEvent,
} from "@/lib/whatsapp/webhook";
import type { WebhookPayload } from "@/lib/whatsapp/types";
import { whatsappClient } from "@/lib/whatsapp/client";
import { processMessage } from "@/lib/agent";
import {
  findOrCreateConversation,
  saveInboundMessage,
  saveOutboundMessage,
  updateMessageStatus,
} from "@/lib/db/queries";

export const maxDuration = 60;

// ============================================================
// GET - Webhook Verification (Meta challenge)
// ============================================================
export async function GET(request: NextRequest) {
  const challenge = verifyWebhookChallenge(request.nextUrl.searchParams);

  if (challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

// ============================================================
// POST - Receive webhook events
// WABA requires a 200 response within ~3 seconds.
// We respond immediately and process asynchronously via `after()`.
// ============================================================
export async function POST(request: NextRequest) {
  let payload: WebhookPayload;

  try {
    payload = (await request.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = parseWebhookPayload(payload);

  // Respond 200 immediately to satisfy WABA's timeout requirement
  // then process events in the background via next/server `after()`
  after(async () => {
    for (const event of events) {
      try {
        if (event.type === "message") {
          await handleMessageEvent(event);
        } else if (event.type === "status") {
          await handleStatusEvent(event);
        }
      } catch (error) {
        console.error(`Error processing ${event.type} event:`, error);
      }
    }
  });

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

// ============================================================
// Event Handlers
// ============================================================

async function handleMessageEvent(event: ParsedMessageEvent) {
  const { message, contact, phoneNumberId } = event;

  // Skip system messages and unsupported types
  if (message.type === "system" || message.type === "unsupported") {
    return;
  }

  // Find or create conversation
  const conversation = await findOrCreateConversation(
    message.from,
    phoneNumberId,
    contact.profile.name
  );

  // Skip if conversation is blocked
  if (conversation.status === "blocked") {
    return;
  }

  // Persist inbound message
  await saveInboundMessage(conversation.id, message);

  // Mark as read
  try {
    await whatsappClient.markAsRead(message.id);
  } catch {
    // Non-critical, continue processing
  }

  // Skip reactions from triggering AI response
  if (message.type === "reaction") {
    return;
  }

  // Process with Claude agent
  const agentResponse = await processMessage(message, conversation.id);

  // Send text reply if the agent produced one
  if (agentResponse.textReply) {
    try {
      const result = await whatsappClient.sendText(
        message.from,
        agentResponse.textReply
      );

      if (result.messages?.[0]?.id) {
        await saveOutboundMessage(
          conversation.id,
          result.messages[0].id,
          "text",
          { text: { body: agentResponse.textReply } }
        );
      }
    } catch (error) {
      console.error("Failed to send reply:", error);
    }
  }
}

async function handleStatusEvent(event: ParsedStatusEvent) {
  const { status } = event;

  try {
    await updateMessageStatus(status.id, status.status);
  } catch (error) {
    console.error("Failed to update message status:", error);
  }
}
