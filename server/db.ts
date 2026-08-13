import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set.");
}

const useSSL = process.env.DATABASE_SSL === "true" || process.env.NODE_ENV === "production";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSSL ? { rejectUnauthorized: true } : undefined,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Prevent unexpected client errors from propagating as unhandled rejections
// and crashing the process. pg emits 'error' on the pool when a connection
// drops unexpectedly (e.g. idle-connection TCP timeout from the cloud proxy).
pool.on("error", (err) => {
  console.error("[db] Unexpected pool client error — connection will be recycled:", err.message);
});

export const db = drizzle(pool, { schema });
