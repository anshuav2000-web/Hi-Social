/**
 * Server-side environment access. Never import this from a client component.
 */
const bool = (v: string | undefined, fallback = false) => {
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1";
};

export const env = {
  appOrigin: process.env.APP_ORIGIN || "http://localhost:3000",
  databasePath: process.env.DATABASE_PATH || "",
  storageDir: process.env.STORAGE_DIR || "",
  encryptionKey: process.env.APP_ENCRYPTION_KEY || "",
  workerSecret: process.env.WORKER_SECRET || "",
  seedDemo: bool(process.env.SEED_DEMO, true),
  inprocessScheduler: bool(process.env.ENABLE_INPROCESS_SCHEDULER, true),
  schedulerIntervalSeconds: Number(process.env.SCHEDULER_INTERVAL_SECONDS || 20),
  meta: {
    appId: process.env.META_APP_ID || "",
    appSecret: process.env.META_APP_SECRET || "",
    redirectUri:
      process.env.META_REDIRECT_URI ||
      `${process.env.APP_ORIGIN || "http://localhost:3000"}/api/v1/integrations/meta/callback`,
    graphVersion: process.env.META_GRAPH_VERSION || "v23.0",
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || "",
    facebookLogin: bool(process.env.META_ENABLE_FACEBOOK_LOGIN, true),
    instagramLogin: bool(process.env.META_ENABLE_INSTAGRAM_LOGIN, true),
  },
  ai: {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "",
    ollamaModel: process.env.OLLAMA_MODEL || "llama3.1",
    openaiBaseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL || "",
    openaiApiKey: process.env.OPENAI_COMPATIBLE_API_KEY || "",
    openaiModel: process.env.OPENAI_COMPATIBLE_MODEL || "",
    order: (process.env.AI_PROVIDER_ORDER || "ollama,openai,template")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  },
  smtpUrl: process.env.SMTP_URL || "",
  smtpFrom: process.env.SMTP_FROM || "SocialHub Pro <no-reply@example.com>",
};

export const metaConfigured = () => Boolean(env.meta.appId && env.meta.appSecret);
