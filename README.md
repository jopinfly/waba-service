# WABA Auto-Reply Service

WhatsApp Business API auto-reply service, powered by Claude (Vertex AI) with an agentic tool loop.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| Hosting | Vercel |
| AI | Claude via Google Vertex AI (`@anthropic-ai/vertex-sdk`) |
| Database | Neon (PostgreSQL) + Drizzle ORM |
| File Storage | Vercel Blob |

## Project Structure

```
src/
├── app/api/webhook/route.ts   Webhook entry (GET verification + POST messages)
├── config/index.ts            Environment & credentials
└── lib/
    ├── whatsapp/
    │   ├── types.ts           All WABA message type definitions
    │   ├── client.ts          WhatsApp Cloud API client
    │   └── webhook.ts         Payload parsing & verification
    ├── agent/
    │   ├── index.ts           Claude agentic loop core
    │   ├── tools.ts           Tool definitions & executors
    │   └── system-prompt.ts   System prompt builder
    ├── db/
    │   ├── schema.ts          Drizzle table schemas
    │   ├── queries.ts         Database operations
    │   └── index.ts           Neon connection
    └── storage/index.ts       Vercel Blob media storage
```

---

## Full Processing Flow

Below is the complete lifecycle of a WhatsApp message: from the moment Meta's servers send a webhook callback, through session management and AI processing, to the final reply delivered back to the user.

### Phase 1: Webhook Reception & Immediate Response

```
User sends message on WhatsApp
        │
        ▼
Meta WABA servers ──POST──▶ /api/webhook (route.ts)
        │
        ├─ 1. Parse JSON body as WebhookPayload
        ├─ 2. parseWebhookPayload() extracts events
        │     (separates message events from status events)
        ├─ 3. Return HTTP 200 immediately  ◀── CRITICAL: must respond within 3 seconds
        │
        └─ 4. after() schedules background processing
              (Next.js server-side callback, runs after response is sent)
```

**Why `after()`?** WABA mandates a response within approximately 3 seconds or it will retry the webhook. The `after()` API from `next/server` lets us return 200 instantly while continuing to process the message in the same serverless invocation (up to `maxDuration = 60s`).

### Phase 2: Event Routing

```
after() callback
    │
    ├─ Status event (sent/delivered/read/failed)
    │     └─ updateMessageStatus() ──▶ Update messages table
    │
    └─ Message event
          │
          ├─ Skip: type === "system" or "unsupported"
          ├─ Skip: conversation.status === "blocked"
          ├─ Skip (no AI): type === "reaction" (saved but no reply)
          │
          └─ Continue to Phase 3
```

### Phase 3: Session Management

```
handleMessageEvent()
    │
    ├─ 1. findOrCreateConversation(wa_chat_id, phone_number_id, contact_name)
    │     │
    │     ├─ Query: SELECT from conversations WHERE wa_chat_id AND phone_number_id
    │     ├─ If found → return existing (update contact_name if changed)
    │     └─ If not found → INSERT new conversation (status: "active")
    │
    ├─ 2. saveInboundMessage(conversation_id, message)
    │     └─ INSERT into messages (direction: "inbound", full content as JSONB)
    │
    └─ 3. markAsRead(message_id) via WhatsApp API
          └─ Sends read receipt (blue ticks) — non-critical, errors swallowed
```

**Session identity:** A conversation is uniquely identified by the composite key `(wa_chat_id, phone_number_id)`. `wa_chat_id` is the user's WhatsApp number; `phone_number_id` is the business number receiving the message. This supports multiple business numbers on a single deployment.

### Phase 4: AI Processing (Agentic Loop)

```
processMessage(message, conversation_id)
    │
    ├─ 1. Load conversation metadata
    │     └─ getConversation() → check for systemPromptOverride
    │
    ├─ 2. Build system prompt
    │     └─ buildSystemPrompt(override?) → base prompt + optional custom instructions
    │
    ├─ 3. Load conversation history for Claude
    │     └─ getClaudeContext(conversation_id) → stored API message array
    │
    ├─ 4. Build user message content
    │     └─ Attach metadata: [message_id] [from] [type] [reply_to]
    │        + extractTextContent() for human-readable representation
    │
    ├─ 5. Assemble Claude messages
    │     └─ [...existingMessages.slice(-40), newUserMessage]
    │         ▲ MAX_CONTEXT_MESSAGES = 40 (sliding window)
    │
    └─ 6. Enter agentic loop → runAgentLoop()
```

#### The Agentic Loop (`runAgentLoop`)

This is the core AI interaction pattern. Claude can call tools and receive results in a multi-turn loop (up to `MAX_AGENTIC_TURNS = 5` iterations):

```
runAgentLoop(systemPrompt, messages, toolContext)
    │
    │  ┌──────────────────────────────────────────────────────────┐
    │  │                   TURN N (max 5)                        │
    │  │                                                          │
    │  │  Claude API call:                                        │
    │  │    model, system prompt, tools, messages ──▶ Vertex AI   │
    │  │                                                          │
    │  │  Append assistant response to messages                   │
    │  │                                                          │
    │  │  Check stop_reason:                                      │
    │  │    │                                                     │
    │  │    ├─ "end_turn" ──▶ Extract text → RETURN               │
    │  │    │                                                     │
    │  │    ├─ "tool_use" ──▶ For each tool_use block:            │
    │  │    │     │                                               │
    │  │    │     ├─ executeTool(name, input, context)             │
    │  │    │     │    ├─ send_interactive_buttons                 │
    │  │    │     │    ├─ send_interactive_list                    │
    │  │    │     │    ├─ send_reaction                            │
    │  │    │     │    └─ send_location                            │
    │  │    │     │                                               │
    │  │    │     └─ Append tool_result to messages                │
    │  │    │                                                     │
    │  │    │   └─ CONTINUE to next turn                          │
    │  │    │                                                     │
    │  │    └─ other ──▶ Extract text → RETURN                    │
    │  │                                                          │
    │  └──────────────────────────────────────────────────────────┘
    │
    └─ Returns: { responseText, toolsUsed[], finalMessages }
```

**Key design choices:**

- **Tool execution happens mid-loop.** When Claude decides to send an interactive button message, the tool executor calls the WhatsApp API *during* the loop. Claude then sees the result and can decide its next action (e.g., send a follow-up text, call another tool, or finish).
- **Messages accumulate.** Each turn appends the assistant response and tool results to the message array. Claude sees the full conversation context on every turn.
- **Safety limit.** The loop is capped at 5 turns to prevent runaway API calls. If exceeded, a fallback error message is returned.

### Phase 5: Context Persistence

```
After runAgentLoop() returns:
    │
    └─ saveClaudeContext(conversation_id, finalMessages)
          │
          └─ UPSERT into claude_contexts
               ├─ messages: full Claude API message array (JSONB)
               └─ updated_at: now
```

**Two-layer persistence:**

| Table | Purpose | Content |
|-------|---------|---------|
| `messages` | Business record | Every inbound/outbound WhatsApp message with original payload |
| `claude_contexts` | AI continuity | Claude API message array for the ongoing conversation |

They serve different roles. `messages` is the audit log. `claude_contexts` is the working memory that Claude uses to maintain conversational context across multiple user interactions.

### Phase 6: Reply Delivery

```
Back in handleMessageEvent():
    │
    ├─ agentResponse.textReply exists?
    │     │
    │     ├─ Yes → whatsappClient.sendText(to, text)
    │     │         ├─ POST to WhatsApp Cloud API
    │     │         └─ saveOutboundMessage() → persist to messages table
    │     │
    │     └─ No → (tools already sent messages during the loop)
    │
    └─ Done. User receives reply on WhatsApp.
```

**Note on tool-sent messages:** If Claude used tools like `send_interactive_buttons` during the agentic loop, those messages were already sent to the user via WhatsApp API in Phase 4. The `textReply` in Phase 6 is only for the final text response. It's possible for a single user message to trigger both tool-sent messages (e.g., a button menu) and a text reply, or just one of them.

### Complete Sequence Diagram

```
WhatsApp User          Meta WABA          Vercel (route.ts)         Neon DB           Claude (Vertex)       WhatsApp API
     │                    │                     │                     │                    │                    │
     │── send message ──▶│                     │                     │                    │                    │
     │                    │── POST webhook ───▶│                     │                    │                    │
     │                    │                     │── parse payload     │                    │                    │
     │                    │◀── 200 OK ─────────│                     │                    │                    │
     │                    │                     │                     │                    │                    │
     │                    │                     │─── after() ────────┐│                    │                    │
     │                    │                     │                    ││                    │                    │
     │                    │                     │  findOrCreate ────▶││                    │                    │
     │                    │                     │  conversation      ││                    │                    │
     │                    │                     │◀── conversation ───┘│                    │                    │
     │                    │                     │                     │                    │                    │
     │                    │                     │  saveInbound ──────▶│                    │                    │
     │                    │                     │                     │                    │                    │
     │                    │                     │  markAsRead ───────────────────────────────────────────────▶│
     │                    │                     │                     │                    │                    │
     │                    │                     │  getClaudeContext ─▶│                    │                    │
     │                    │                     │◀── history ─────────│                    │                    │
     │                    │                     │                     │                    │                    │
     │                    │                     │── messages.create ─────────────────────▶│                    │
     │                    │                     │◀── response (tool_use) ────────────────│                    │
     │                    │                     │                     │                    │                    │
     │                    │                     │── execute tool (send buttons) ─────────────────────────────▶│
     │◀── button msg ─────────────────────────────────────────────────────────────────────────────────────────│
     │                    │                     │                     │                    │                    │
     │                    │                     │── messages.create (with tool_result) ──▶│                    │
     │                    │                     │◀── response (end_turn, text) ──────────│                    │
     │                    │                     │                     │                    │                    │
     │                    │                     │  saveClaudeContext ▶│                    │                    │
     │                    │                     │                     │                    │                    │
     │                    │                     │── sendText ─────────────────────────────────────────────────▶│
     │◀── text reply ─────────────────────────────────────────────────────────────────────────────────────────│
     │                    │                     │                     │                    │                    │
     │                    │                     │  saveOutbound ─────▶│                    │                    │
     │                    │                     │                     │                    │                    │
```

---

## Database Schema

Four tables manage the full lifecycle:

```
conversations              messages                claude_contexts          media_files
┌──────────────────┐      ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ id (PK)          │◀──┐  │ id (PK)          │    │ id (PK)          │    │ id (PK)          │
│ wa_chat_id       │   ├──│ conversation_id   │    │ conversation_id  │──▶ │ message_id (FK)  │
│ phone_number_id  │   │  │ wa_message_id     │    │ messages (JSONB) │    │ wa_media_id      │
│ contact_name     │   │  │ direction         │    │ token_count      │    │ mime_type         │
│ status           │   │  │ type              │    │ updated_at       │    │ blob_url          │
│ metadata (JSONB) │   │  │ content (JSONB)   │    └──────────────────┘    │ filename          │
│ system_prompt_   │   │  │ status            │                            │ size_bytes        │
│   override       │   │  │ created_at        │                            │ created_at        │
│ created_at       │   │  └──────────────────┘                            └──────────────────┘
│ updated_at       │   │
└──────────────────┘   └──(1:N)
```

## Available Agent Tools

| Tool | Description | WhatsApp Result |
|------|-------------|-----------------|
| `send_interactive_buttons` | Up to 3 quick-reply buttons | Button message |
| `send_interactive_list` | Sectioned list with up to 10 rows | List picker message |
| `send_reaction` | React to a message with emoji | Emoji reaction |
| `send_location` | Send a GPS pin | Location card |

Tools are defined in `src/lib/agent/tools.ts`. To add a new tool:

1. Add the tool definition to the `agentTools` array
2. Add a case to the `executeTool` switch
3. Implement the executor function

---

## Setup

### Environment Variables

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `WHATSAPP_VERIFY_TOKEN` | Your chosen webhook verification token |
| `WHATSAPP_ACCESS_TOKEN` | Meta Graph API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Business phone number ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WABA account ID |
| `GOOGLE_CLOUD_PROJECT_ID` | GCP project with Vertex AI enabled |
| `GOOGLE_CLOUD_REGION` | Vertex AI region (default: `us-east5`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account JSON (for Vercel deployment) |
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage token |

### Database

```bash
npm run db:push
```

### Development

```bash
npm run dev
# Expose via ngrok for webhook testing:
# ngrok http 3000
```

### Webhook Configuration

In Meta Developer Console, set the webhook URL to:
```
https://your-domain.vercel.app/api/webhook
```
Subscribe to the `messages` field.
