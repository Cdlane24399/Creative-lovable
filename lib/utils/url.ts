const LOCAL_HOST_PATTERNS = [
  /^localhost(?::\d+)?$/i,
  /^127(?:\.\d{1,3}){3}(?::\d+)?$/,
  /^0\.0\.0\.0(?::\d+)?$/,
  /^\[::1\](?::\d+)?$/,
]
const SANDBOX_PORT_PREFIX_PATTERN = /^\d{2,5}-/

function stripProtocol(value: string): string {
  return value.replace(/^\s*https?:\/\//i, "").trim()
}

function hasHttpProtocol(value: string): boolean {
  return /^\s*https?:\/\//i.test(value)
}

function hasAnyProtocol(value: string): boolean {
  return /^\s*[a-z][a-z\d+\-.]*:\/\//i.test(value)
}

function isLikelyLocalHost(value: string): boolean {
  const host = stripProtocol(value).split("/")[0] || ""
  return LOCAL_HOST_PATTERNS.some((pattern) => pattern.test(host))
}

function stringifyUrlWithoutRootSlash(url: URL): string {
  if (url.pathname === "/" && !url.search && !url.hash) {
    return `${url.protocol}//${url.host}`
  }

  return url.toString()
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1"
  )
}

/**
 * E2B preview hosts are typically `<port>-<sandbox-id>.<domain>`.
 * For local debug mode, localhost URLs are allowed.
 */
function isLikelySandboxPreviewUrl(url: URL): boolean {
  if (isLocalHostname(url.hostname)) {
    return Boolean(url.port)
  }

  return SANDBOX_PORT_PREFIX_PATTERN.test(url.hostname)
}

/**
 * Convert host/URL input into a normalized absolute HTTP(S) URL.
 * - Host-only values like `3000-sbx.e2b.app` become `https://...`
 * - Local hosts like `localhost:3000` become `http://...`
 * - Non-http(s) schemes are rejected.
 */
export function normalizeSandboxPreviewUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (hasAnyProtocol(trimmed) && !hasHttpProtocol(trimmed)) {
    return null
  }

  const withProtocol = hasHttpProtocol(trimmed)
    ? trimmed
    : `${isLikelyLocalHost(trimmed) ? "http" : "https"}://${trimmed}`

  try {
    const parsed = new URL(withProtocol)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null
    }
    if (!parsed.hostname) {
      return null
    }
    if (!isLikelySandboxPreviewUrl(parsed)) {
      return null
    }

    return stringifyUrlWithoutRootSlash(parsed)
  } catch {
    return null
  }
}
