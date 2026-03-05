import { eq, and, desc } from "drizzle-orm";
import { db } from "./index";
import { conversations, messages, claudeContexts, mediaFiles } from "./schema";
import type { InboundMessage } from "../whatsapp/types";

// ============================================================
// Conversations
// ============================================================

export async function findOrCreateConversation(
  waChatId: string,
  phoneNumberId: string,
  contactName?: string
) {
  const existing = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.waChatId, waChatId),
        eq(conversations.phoneNumberId, phoneNumberId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    if (contactName && contactName !== existing[0].contactName) {
      await db
        .update(conversations)
        .set({ contactName, updatedAt: new Date() })
        .where(eq(conversations.id, existing[0].id));
    }
    return existing[0];
  }

  const [newConversation] = await db
    .insert(conversations)
    .values({ waChatId, phoneNumberId, contactName })
    .returning();

  return newConversation;
}

export async function getConversation(id: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);

  return conversation || null;
}

export async function updateConversationStatus(
  id: string,
  status: "active" | "archived" | "blocked"
) {
  await db
    .update(conversations)
    .set({ status, updatedAt: new Date() })
    .where(eq(conversations.id, id));
}

// ============================================================
// Messages
// ============================================================

export async function saveInboundMessage(
  conversationId: string,
  message: InboundMessage
) {
  const [saved] = await db
    .insert(messages)
    .values({
      conversationId,
      waMessageId: message.id,
      direction: "inbound",
      type: message.type,
      content: message as unknown as Record<string, unknown>,
      status: "delivered",
    })
    .returning();

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  return saved;
}

export async function saveOutboundMessage(
  conversationId: string,
  waMessageId: string,
  type: string,
  content: Record<string, unknown>
) {
  const [saved] = await db
    .insert(messages)
    .values({
      conversationId,
      waMessageId,
      direction: "outbound",
      type,
      content,
      status: "sent",
    })
    .returning();

  return saved;
}

export async function updateMessageStatus(
  waMessageId: string,
  status: "sent" | "delivered" | "read" | "failed"
) {
  await db
    .update(messages)
    .set({ status })
    .where(eq(messages.waMessageId, waMessageId));
}

export async function getRecentMessages(
  conversationId: string,
  limit: number = 20
) {
  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return result.reverse();
}

// ============================================================
// Claude Context
// ============================================================

export async function getClaudeContext(conversationId: string) {
  const [ctx] = await db
    .select()
    .from(claudeContexts)
    .where(eq(claudeContexts.conversationId, conversationId))
    .limit(1);

  return ctx || null;
}

export async function saveClaudeContext(
  conversationId: string,
  claudeMessages: unknown[],
  tokenCount?: number
) {
  await db
    .insert(claudeContexts)
    .values({
      conversationId,
      messages: claudeMessages,
      tokenCount: tokenCount || 0,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: claudeContexts.conversationId,
      set: {
        messages: claudeMessages,
        tokenCount: tokenCount || 0,
        updatedAt: new Date(),
      },
    });
}

export async function clearClaudeContext(conversationId: string) {
  await db
    .delete(claudeContexts)
    .where(eq(claudeContexts.conversationId, conversationId));
}

// ============================================================
// Media Files
// ============================================================

export async function saveMediaFile(data: {
  messageId?: string;
  waMediaId?: string;
  mimeType: string;
  blobUrl: string;
  filename?: string;
  sizeBytes?: number;
}) {
  const [saved] = await db.insert(mediaFiles).values(data).returning();
  return saved;
}

export async function getMediaByWaId(waMediaId: string) {
  const [media] = await db
    .select()
    .from(mediaFiles)
    .where(eq(mediaFiles.waMediaId, waMediaId))
    .limit(1);

  return media || null;
}
