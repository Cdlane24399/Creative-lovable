/**
 * File categorization utilities for the web builder agent.
 *
 * This module provides functions to categorize files by their type
 * based on file paths and naming conventions.
 */

/**
 * Categorizes files by type based on their paths.
 * Groups files into pages, components, styles, config, and other categories.
 *
 * @param files - Array of file paths to categorize
 * @returns Record with categorized file arrays
 */
export function categorizeFiles(files: string[]): Record<string, string[]> {
  const categories: Record<string, string[]> = {
    pages: [],
    components: [],
    styles: [],
    config: [],
    other: [],
  }

  for (const file of files) {
    if (file.includes("/page.") || file === "page.tsx" || file === "page.jsx") {
      categories.pages.push(file)
    } else if (file.includes("components/") || file.includes("/components/")) {
      categories.components.push(file)
    } else if (file.endsWith(".css") || file.includes("styles")) {
      categories.styles.push(file)
    } else if (file.endsWith(".json") || file.endsWith(".config.ts") || file.endsWith(".config.js")) {
      categories.config.push(file)
    } else {
      categories.other.push(file)
    }
  }

  return categories
}
