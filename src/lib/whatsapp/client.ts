import { config } from "@/config";
import type {
  OutboundMessage,
  SendMessageResponse,
  MediaUrlResponse,
} from "./types";

class WhatsAppClient {
  private accessToken: string;
  private phoneNumberId: string;
  private baseUrl: string;

  constructor() {
    this.accessToken = config.whatsapp.accessToken;
    this.phoneNumberId = config.whatsapp.phoneNumberId;
    this.baseUrl = config.whatsapp.apiBaseUrl;
  }

  private get messagesUrl(): string {
    return `${this.baseUrl}/${this.phoneNumberId}/messages`;
  }

  private async request<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `WhatsApp API error ${response.status}: ${JSON.stringify(error)}`
      );
    }

    return response.json() as Promise<T>;
  }

  async sendMessage(message: OutboundMessage): Promise<SendMessageResponse> {
    return this.request<SendMessageResponse>(this.messagesUrl, {
      method: "POST",
      body: JSON.stringify(message),
    });
  }

  async sendText(to: string, body: string): Promise<SendMessageResponse> {
    return this.sendMessage({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body },
    });
  }

  async sendReaction(
    to: string,
    messageId: string,
    emoji: string
  ): Promise<SendMessageResponse> {
    return this.sendMessage({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "reaction",
      reaction: { message_id: messageId, emoji },
    });
  }

  async sendImage(
    to: string,
    imageUrl: string,
    caption?: string
  ): Promise<SendMessageResponse> {
    return this.sendMessage({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "image",
      image: { link: imageUrl, caption },
    });
  }

  async sendDocument(
    to: string,
    documentUrl: string,
    filename?: string,
    caption?: string
  ): Promise<SendMessageResponse> {
    return this.sendMessage({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "document",
      document: { link: documentUrl, filename, caption },
    });
  }

  async sendLocation(
    to: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string
  ): Promise<SendMessageResponse> {
    return this.sendMessage({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "location",
      location: { latitude, longitude, name, address },
    });
  }

  async sendInteractiveButtons(
    to: string,
    bodyText: string,
    buttons: Array<{ id: string; title: string }>,
    headerText?: string,
    footerText?: string
  ): Promise<SendMessageResponse> {
    return this.sendMessage({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        header: headerText ? { type: "text", text: headerText } : undefined,
        body: { text: bodyText },
        footer: footerText ? { text: footerText } : undefined,
        action: {
          buttons: buttons.slice(0, 3).map((b) => ({
            type: "reply" as const,
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    });
  }

  async sendInteractiveList(
    to: string,
    bodyText: string,
    buttonLabel: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    headerText?: string,
    footerText?: string
  ): Promise<SendMessageResponse> {
    return this.sendMessage({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        header: headerText ? { type: "text", text: headerText } : undefined,
        body: { text: bodyText },
        footer: footerText ? { text: footerText } : undefined,
        action: { button: buttonLabel, sections },
      },
    });
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: OutboundMessage extends { template: infer T }
      ? T extends { components?: infer C }
        ? C
        : never
      : never
  ): Promise<SendMessageResponse> {
    return this.sendMessage({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    });
  }

  async markAsRead(messageId: string): Promise<void> {
    await this.request(this.messagesUrl, {
      method: "POST",
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
  }

  async getMediaUrl(mediaId: string): Promise<MediaUrlResponse> {
    return this.request<MediaUrlResponse>(
      `${this.baseUrl}/${mediaId}`
    );
  }

  async downloadMedia(mediaUrl: string): Promise<ArrayBuffer> {
    const response = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to download media: ${response.status}`);
    }

    return response.arrayBuffer();
  }
}

export const whatsappClient = new WhatsAppClient();
