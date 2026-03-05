export const config = {
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN!,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID!,
    apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
    get apiBaseUrl() {
      return `https://graph.facebook.com/${this.apiVersion}`;
    },
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: "claude-sonnet-4-6" as const,
    maxTokens: 4096,
  },
} as const;
