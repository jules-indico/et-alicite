import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

let cached: ReturnType<typeof drizzle<typeof schema>> | null = null

/**
 * Shared Neon Postgres client over the serverless HTTP driver (no
 * long-lived pg pools — safe for Vercel serverless functions). Throws a
 * clear error when DATABASE_URL is missing instead of failing obscurely.
 */
export function db() {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Create a Neon Postgres database (Vercel Marketplace → Neon) " +
        "and add its pooled connection string to .env.local (local) and the Vercel project settings (deploy)."
    )
  }
  const sql = neon(url)
  cached = drizzle(sql, { schema })
  return cached
}

export { schema }
