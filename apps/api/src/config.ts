import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default("/api"),
  CORS_ORIGIN: z.string().default("http://localhost:5173,http://localhost:5174"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_ANON_KEY: z.string().min(1, "SUPABASE_ANON_KEY is required"),
  SUPABASE_JWT_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional()
});

const env = envSchema.parse(process.env);

function normalizeRoute(value: string) {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

export const config = {
  nodeEnv: env.NODE_ENV,
  port: env.PORT,
  apiPrefix: normalizeRoute(env.API_PREFIX),
  corsOrigins: env.CORS_ORIGIN.split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  databaseUrl: env.DATABASE_URL,
  supabaseUrl: env.SUPABASE_URL.replace(/\/+$/, ""),
  supabaseAnonKey: env.SUPABASE_ANON_KEY,
  supabaseJwtSecret: env.SUPABASE_JWT_SECRET ?? "",
  telegramBotToken: env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatId: env.TELEGRAM_CHAT_ID ?? ""
};
