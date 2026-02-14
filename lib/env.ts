/**
 * Environment variable validation
 *
 * Validates required environment variables at import time.
 * Throws ConfigurationError with clear messages on missing vars.
 *
 * Usage:
 *   import { env } from "@/lib/env"
 *   const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, ...)
 */

import { ConfigurationError } from "./errors"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new ConfigurationError(
      `Missing required environment variable: ${name}. ` +
        `Set it in .env.local or your deployment environment.`,
    )
  }
  return value
}

function optionalEnv(name: string, defaultValue?: string): string | undefined {
  return process.env[name] || defaultValue
}

const isDev = process.env.NODE_ENV === "development"

/**
 * Validated environment variables.
 *
 * Server-only variables are validated lazily to avoid crashing client bundles.
 * NEXT_PUBLIC_* vars are validated eagerly since they're needed on both sides.
 */
export const env = {
  // ── Public (available in browser) ──────────────────────────────────
  // These use optionalEnv on the client to avoid crashing the page when
  // env vars are missing (e.g. during static generation or local dev
  // without Supabase). Server-side callers should validate before use.
  get NEXT_PUBLIC_SUPABASE_URL() {
    const value = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!value && typeof window === "undefined") {
      throw new ConfigurationError(
        `Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL. ` +
          `Set it in .env.local or your deployment environment.`,
      )
    }
    return value ?? ""
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() {
    const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!value && typeof window === "undefined") {
      throw new ConfigurationError(
        `Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY. ` +
          `Set it in .env.local or your deployment environment.`,
      )
    }
    return value ?? ""
  },

  // ── Server-only (lazy getters — only fail when accessed) ───────────
  get SUPABASE_SERVICE_ROLE_KEY() {
    return requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  },
  get E2B_API_KEY() {
    return requireEnv("E2B_API_KEY")
  },

  // ── Optional ───────────────────────────────────────────────────────
  get API_KEY() {
    return optionalEnv("API_KEY")
  },
  get AI_GATEWAY_API_KEY() {
    return optionalEnv("AI_GATEWAY_API_KEY")
  },
  get AI_GATEWAY_URL() {
    return optionalEnv("AI_GATEWAY_URL")
  },
  get UPSTASH_REDIS_REST_URL() {
    return optionalEnv("UPSTASH_REDIS_REST_URL")
  },
  get UPSTASH_REDIS_REST_TOKEN() {
    return optionalEnv("UPSTASH_REDIS_REST_TOKEN")
  },
  get ENCRYPTION_KEY() {
    return optionalEnv("ENCRYPTION_KEY")
  },
  get E2B_TEMPLATE() {
    return optionalEnv("E2B_TEMPLATE") || optionalEnv("E2B_TEMPLATE_ID")
  },
  get OPENROUTER_API_KEY() {
    return optionalEnv("OPENROUTER_API_KEY")
  },
  get LOG_LEVEL() {
    return optionalEnv("LOG_LEVEL", isDev ? "debug" : "info")
  },

  // ── Flags ──────────────────────────────────────────────────────────
  isDevelopment: isDev,
  isProduction: process.env.NODE_ENV === "production",
}
