// ============================================================
// WABA Webhook Payload Types (Inbound)
// ============================================================

export interface WebhookPayload {
  object: "whatsapp_business_account";
  entry: WebhookEntry[];
}

export interface WebhookEntry {
  id: string;
  changes: WebhookChange[];
}

export interface WebhookChange {
  value: WebhookValue;
  field: "messages";
}

export interface WebhookValue {
  messaging_product: "whatsapp";
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WebhookContact[];
  messages?: InboundMessage[];
  statuses?: MessageStatus[];
  errors?: WebhookError[];
}

export interface WebhookContact {
  profile: { name: string };
  wa_id: string;
}

// ============================================================
// Inbound Message Types
// ============================================================

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "sticker"
  | "location"
  | "contacts"
  | "interactive"
  | "button"
  | "reaction"
  | "order"
  | "system"
  | "unknown"
  | "unsupported";

export interface InboundMessageBase {
  from: string;
  id: string;
  timestamp: string;
  context?: {
    from: string;
    id: string;
    referred_product?: {
      catalog_id: string;
      product_retailer_id: string;
    };
  };
}

export interface TextMessage extends InboundMessageBase {
  type: "text";
  text: { body: string };
}

export interface MediaMessageBase extends InboundMessageBase {
  type: "image" | "video" | "audio" | "document" | "sticker";
}

export interface ImageMessage extends MediaMessageBase {
  type: "image";
  image: MediaObject;
}

export interface VideoMessage extends MediaMessageBase {
  type: "video";
  video: MediaObject;
}

export interface AudioMessage extends MediaMessageBase {
  type: "audio";
  audio: MediaObject;
}

export interface DocumentMessage extends MediaMessageBase {
  type: "document";
  document: MediaObject & { filename?: string };
}

export interface StickerMessage extends MediaMessageBase {
  type: "sticker";
  sticker: MediaObject & { animated?: boolean };
}

export interface LocationMessage extends InboundMessageBase {
  type: "location";
  location: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
    url?: string;
  };
}

export interface ContactsMessage extends InboundMessageBase {
  type: "contacts";
  contacts: ContactCard[];
}

export interface InteractiveMessage extends InboundMessageBase {
  type: "interactive";
  interactive: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

export interface ButtonMessage extends InboundMessageBase {
  type: "button";
  button: { text: string; payload: string };
}

export interface ReactionMessage extends InboundMessageBase {
  type: "reaction";
  reaction: {
    message_id: string;
    emoji: string;
  };
}

export interface OrderMessage extends InboundMessageBase {
  type: "order";
  order: {
    catalog_id: string;
    product_items: Array<{
      product_retailer_id: string;
      quantity: number;
      item_price: number;
      currency: string;
    }>;
    text?: string;
  };
}

export interface SystemMessage extends InboundMessageBase {
  type: "system";
  system: {
    body: string;
    identity?: string;
    new_wa_id?: string;
    type?: string;
  };
}

export interface UnsupportedMessage extends InboundMessageBase {
  type: "unsupported";
  errors?: Array<{ code: number; title: string; message: string }>;
}

export type InboundMessage =
  | TextMessage
  | ImageMessage
  | VideoMessage
  | AudioMessage
  | DocumentMessage
  | StickerMessage
  | LocationMessage
  | ContactsMessage
  | InteractiveMessage
  | ButtonMessage
  | ReactionMessage
  | OrderMessage
  | SystemMessage
  | UnsupportedMessage;

// ============================================================
// Media Object
// ============================================================

export interface MediaObject {
  id: string;
  mime_type: string;
  sha256?: string;
  caption?: string;
}

// ============================================================
// Contact Card
// ============================================================

export interface ContactCard {
  addresses?: Array<{
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    country_code?: string;
    type?: "HOME" | "WORK";
  }>;
  birthday?: string;
  emails?: Array<{ email?: string; type?: "HOME" | "WORK" }>;
  name: {
    formatted_name: string;
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    suffix?: string;
    prefix?: string;
  };
  org?: { company?: string; department?: string; title?: string };
  phones?: Array<{ phone?: string; type?: "HOME" | "WORK" | "CELL"; wa_id?: string }>;
  urls?: Array<{ url?: string; type?: "HOME" | "WORK" }>;
}

// ============================================================
// Message Status Updates
// ============================================================

export interface MessageStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  conversation?: {
    id: string;
    origin: { type: string };
    expiration_timestamp?: string;
  };
  pricing?: { billable: boolean; pricing_model: string; category: string };
  errors?: WebhookError[];
}

export interface WebhookError {
  code: number;
  title: string;
  message: string;
  error_data?: { details: string };
}

// ============================================================
// Outbound Message Types (Sending)
// ============================================================

export interface OutboundTextMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text";
  text: { preview_url?: boolean; body: string };
}

export interface OutboundImageMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "image";
  image: { link?: string; id?: string; caption?: string };
}

export interface OutboundVideoMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "video";
  video: { link?: string; id?: string; caption?: string };
}

export interface OutboundAudioMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "audio";
  audio: { link?: string; id?: string };
}

export interface OutboundDocumentMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "document";
  document: { link?: string; id?: string; caption?: string; filename?: string };
}

export interface OutboundStickerMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "sticker";
  sticker: { link?: string; id?: string };
}

export interface OutboundLocationMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "location";
  location: {
    longitude: number;
    latitude: number;
    name?: string;
    address?: string;
  };
}

export interface OutboundContactsMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "contacts";
  contacts: ContactCard[];
}

export interface OutboundInteractiveMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "interactive";
  interactive: InteractiveContent;
}

export interface OutboundReactionMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "reaction";
  reaction: { message_id: string; emoji: string };
}

export interface OutboundTemplateMessage {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: TemplateComponent[];
  };
}

export type OutboundMessage =
  | OutboundTextMessage
  | OutboundImageMessage
  | OutboundVideoMessage
  | OutboundAudioMessage
  | OutboundDocumentMessage
  | OutboundStickerMessage
  | OutboundLocationMessage
  | OutboundContactsMessage
  | OutboundInteractiveMessage
  | OutboundReactionMessage
  | OutboundTemplateMessage;

// ============================================================
// Interactive Message Content
// ============================================================

export type InteractiveContent =
  | InteractiveButton
  | InteractiveList
  | InteractiveCTA;

export interface InteractiveButton {
  type: "button";
  header?: InteractiveHeader;
  body: { text: string };
  footer?: { text: string };
  action: {
    buttons: Array<{
      type: "reply";
      reply: { id: string; title: string };
    }>;
  };
}

export interface InteractiveList {
  type: "list";
  header?: InteractiveHeader;
  body: { text: string };
  footer?: { text: string };
  action: {
    button: string;
    sections: Array<{
      title: string;
      rows: Array<{
        id: string;
        title: string;
        description?: string;
      }>;
    }>;
  };
}

export interface InteractiveCTA {
  type: "cta_url";
  header?: InteractiveHeader;
  body: { text: string };
  footer?: { text: string };
  action: {
    name: "cta_url";
    parameters: { display_text: string; url: string };
  };
}

export interface InteractiveHeader {
  type: "text" | "image" | "video" | "document";
  text?: string;
  image?: { link?: string; id?: string };
  video?: { link?: string; id?: string };
  document?: { link?: string; id?: string; filename?: string };
}

// ============================================================
// Template Components
// ============================================================

export interface TemplateComponent {
  type: "header" | "body" | "button";
  sub_type?: "quick_reply" | "url";
  index?: number;
  parameters?: TemplateParameter[];
}

export type TemplateParameter =
  | { type: "text"; text: string }
  | { type: "currency"; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: "date_time"; date_time: { fallback_value: string } }
  | { type: "image"; image: { link: string } }
  | { type: "document"; document: { link: string; filename?: string } }
  | { type: "video"; video: { link: string } }
  | { type: "payload"; payload: string };

// ============================================================
// API Response
// ============================================================

export interface SendMessageResponse {
  messaging_product: "whatsapp";
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string; message_status?: string }>;
}

export interface MediaUrlResponse {
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  id: string;
  messaging_product: "whatsapp";
}
