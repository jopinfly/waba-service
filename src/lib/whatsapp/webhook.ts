import { config } from "@/config";
import type {
  WebhookPayload,
  InboundMessage,
  MessageStatus,
  WebhookContact,
} from "./types";

export interface ParsedWebhookEvent {
  phoneNumberId: string;
  displayPhoneNumber: string;
}

export interface ParsedMessageEvent extends ParsedWebhookEvent {
  type: "message";
  message: InboundMessage;
  contact: WebhookContact;
}

export interface ParsedStatusEvent extends ParsedWebhookEvent {
  type: "status";
  status: MessageStatus;
}

export type WebhookEvent = ParsedMessageEvent | ParsedStatusEvent;

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature) return false;

  // In production, verify HMAC-SHA256 signature
  // For now, we accept if signature header is present
  // TODO: Implement proper HMAC verification with crypto.subtle
  return signature.startsWith("sha256=");
}

export function verifyWebhookChallenge(params: URLSearchParams): string | null {
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === config.whatsapp.verifyToken && challenge) {
    return challenge;
  }

  return null;
}

export function parseWebhookPayload(payload: WebhookPayload): WebhookEvent[] {
  const events: WebhookEvent[] = [];

  if (payload.object !== "whatsapp_business_account") {
    return events;
  }

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;

      const { value } = change;
      const phoneNumberId = value.metadata.phone_number_id;
      const displayPhoneNumber = value.metadata.display_phone_number;
      const contacts = value.contacts || [];

      if (value.messages) {
        for (const message of value.messages) {
          const contact = contacts.find((c) => c.wa_id === message.from) || {
            profile: { name: "Unknown" },
            wa_id: message.from,
          };

          events.push({
            type: "message",
            phoneNumberId,
            displayPhoneNumber,
            message,
            contact,
          });
        }
      }

      if (value.statuses) {
        for (const status of value.statuses) {
          events.push({
            type: "status",
            phoneNumberId,
            displayPhoneNumber,
            status,
          });
        }
      }
    }
  }

  return events;
}

export function extractTextContent(message: InboundMessage): string {
  switch (message.type) {
    case "text":
      return message.text.body;
    case "image":
      return message.image.caption || "[Image received]";
    case "video":
      return message.video.caption || "[Video received]";
    case "audio":
      return "[Audio message received]";
    case "document":
      return message.document.caption || `[Document: ${message.document.filename || "unnamed"}]`;
    case "sticker":
      return "[Sticker received]";
    case "location":
      return `[Location: ${message.location.name || ""} ${message.location.address || `${message.location.latitude},${message.location.longitude}`}]`;
    case "contacts":
      return `[Contacts shared: ${message.contacts.map((c) => c.name.formatted_name).join(", ")}]`;
    case "interactive":
      if (message.interactive.button_reply) {
        return `[Button: ${message.interactive.button_reply.title}]`;
      }
      if (message.interactive.list_reply) {
        return `[List selection: ${message.interactive.list_reply.title}]`;
      }
      return "[Interactive message]";
    case "button":
      return message.button.text;
    case "reaction":
      return `[Reaction: ${message.reaction.emoji}]`;
    case "order":
      return `[Order: ${message.order.product_items.length} items]`;
    case "system":
      return `[System: ${message.system.body}]`;
    default:
      return "[Unsupported message type]";
  }
}
