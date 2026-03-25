import postgres from "postgres";
import { config } from "./config.js";

export const sql = postgres(config.databaseUrl, {
  idle_timeout: 20,
  max: 1,
  prepare: false,
  ssl: config.nodeEnv === "development" ? "prefer" : "require"
});

export async function closeDb() {
  await sql.end({ timeout: 5 });
}
