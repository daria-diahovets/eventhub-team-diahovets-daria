import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  DATABASE_URL: z.string().url(),
  PRISMA_LOG: z.enum(["query", "off"]).default("off"),
});

export const env = envSchema.parse(process.env);
