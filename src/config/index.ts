import { writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// In serverless environments (Vercel), GOOGLE_APPLICATION_CREDENTIALS can't point
// to a bundled file. We write the service account JSON from an env var to /tmp at
// cold-start, then set the env var so the Google auth library picks it up.
function initGoogleCredentials() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  const json = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!json) return;

  const credPath = join(tmpdir(), "gcp-sa.json");
  if (!existsSync(credPath)) {
    writeFileSync(credPath, json, { mode: 0o600 });
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
}

initGoogleCredentials();

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
  vertex: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID!,
    region: process.env.GOOGLE_CLOUD_REGION || "us-east5",
    model: "claude-sonnet-4-6" as const,
    maxTokens: 4096,
  },
} as const;
