import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  pgEnum,
  index,
  integer,
} from "drizzle-orm/pg-core";

export const conversationStatusEnum = pgEnum("conversation_status", [
  "active",
  "archived",
  "blocked",
]);

export const messageDirectionEnum = pgEnum("message_direction", [
  "inbound",
  "outbound",
]);

export const messageStatusEnum = pgEnum("message_status", [
  "pending",
  "sent",
  "delivered",
  "read",
  "failed",
]);

// ============================================================
// Conversations table
// ============================================================
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    waChatId: varchar("wa_chat_id", { length: 32 }).notNull(),
    phoneNumberId: varchar("phone_number_id", { length: 32 }).notNull(),
    contactName: varchar("contact_name", { length: 255 }),
    status: conversationStatusEnum("status").default("active").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    systemPromptOverride: text("system_prompt_override"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_conversations_wa_chat").on(
      table.waChatId,
      table.phoneNumberId
    ),
    index("idx_conversations_status").on(table.status),
  ]
);

// ============================================================
// Messages table
// ============================================================
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    waMessageId: varchar("wa_message_id", { length: 128 }),
    direction: messageDirectionEnum("direction").notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    status: messageStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_messages_conversation").on(table.conversationId),
    index("idx_messages_wa_id").on(table.waMessageId),
    index("idx_messages_created").on(table.createdAt),
  ]
);

// ============================================================
// Claude conversation context (stores API messages for continuity)
// ============================================================
export const claudeContexts = pgTable("claude_contexts", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .references(() => conversations.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  messages: jsonb("messages").$type<unknown[]>().notNull().default([]),
  tokenCount: integer("token_count").default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// ============================================================
// Media files (tracks downloaded & uploaded media)
// ============================================================
export const mediaFiles = pgTable(
  "media_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    waMediaId: varchar("wa_media_id", { length: 128 }),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    blobUrl: text("blob_url").notNull(),
    filename: varchar("filename", { length: 255 }),
    sizeBytes: integer("size_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_media_wa_id").on(table.waMediaId)]
);
