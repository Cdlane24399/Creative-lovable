/**
 * Path utility functions for the web builder agent.
 * Handles path normalization and validation for sandbox operations.
 */

import path from "node:path"

import { InvalidPathError } from "../errors/web-builder-errors"

/**
 * Normalizes a file path for sandbox operations.
 * Handles various path formats that AI models might generate.
 *
 * @param rawPath - The raw path string from tool input
 * @param stripPrefix - Optional prefix to strip from the path
 * @returns Normalized, validated path
 * @throws InvalidPathError if the path is invalid or attempts directory traversal
 */
export function normalizeSandboxRelativePath(rawPath: string, stripPrefix?: string): string {
  // Normalize slashes and trim whitespace
  const raw = rawPath.trim().replaceAll("\\", "/")

  // Remove leading slashes and "./"
  let cleaned = raw.replace(/^\/+/, "").replace(/^\.\//, "")

  // Strip optional prefix
  if (stripPrefix && cleaned.startsWith(stripPrefix)) {
    cleaned = cleaned.slice(stripPrefix.length)
  }

  // Handle common AI model path mistakes - they sometimes include container paths
  const prefixesToStrip = ["app/", "components/"] as const
  for (const prefix of prefixesToStrip) {
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.slice(prefix.length)
      break // Only strip one prefix
    }
  }

  // Normalize and validate
  const normalized = path.posix.normalize(cleaned)

  if (!normalized || normalized === "." || normalized.startsWith("..")) {
    throw new InvalidPathError(rawPath)
  }

  return normalized
}

/**
 * Normalizes and validates a project-relative path without stripping semantic
 * prefixes like `app/` or `components/`.
 */
export function normalizeProjectRelativePath(rawPath: string): string {
  const raw = rawPath.trim().replaceAll("\\", "/")
  const cleaned = raw.replace(/^\/+/, "").replace(/^\.\//, "")
  const normalized = path.posix.normalize(cleaned)

  if (
    !normalized ||
    normalized === "." ||
    normalized.startsWith("..") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new InvalidPathError(rawPath)
  }

  return normalized
}
