import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/auth"
import {
  captureSandboxScreenshot,
  getHostUrl,
  getSandbox,
} from "@/lib/e2b/sandbox"

/**
 * POST /api/screenshot
 * Capture a screenshot of a URL using E2B Desktop SDK's native screenshot capability.
 * Falls back to SVG placeholder if screenshot fails.
 */
export const POST = withAuth(async (req: NextRequest) => {
  try {
    const { url, projectName, projectId, width = 1280, height = 800 } = await req.json()

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    // Try to capture screenshot using E2B if projectId is provided
    if (projectId) {
      try {
        let captureUrl: string | null = null

        // Fragments-style source of truth: derive preview URL from the live sandbox host.
        // Only use currently active/reconnectable sandboxes; do not create a new sandbox
        // just to capture screenshots.
        try {
          const sandbox = await getSandbox(projectId)
          if (sandbox) {
            const requestedPort = inferPreviewPort(url)
            const resolvedUrl = getHostUrl(sandbox, requestedPort)
            captureUrl = resolvedUrl
            if (resolvedUrl !== url) {
              console.log(`[Screenshot] Canonicalized preview URL from ${url} to ${captureUrl}`)
            }
          } else {
            console.warn("[Screenshot] No active sandbox found, skipping sandbox capture path")
          }
        } catch (urlResolveError) {
          console.warn("[Screenshot] Failed to canonicalize preview URL, skipping direct capture:", urlResolveError)
        }

        if (!captureUrl) {
          if (isSafeSandboxPreviewUrl(url)) {
            const hostScreenshot = await captureViaHostPlaywright(url, width, height)
            if (hostScreenshot) {
              console.log("[Screenshot] Captured via host Playwright fallback (safe direct URL)")
              return NextResponse.json({
                screenshot_base64: hostScreenshot,
                source: "host-playwright-direct",
              })
            }
          }
          console.warn("[Screenshot] No canonical sandbox URL available, falling back to placeholder")
        } else {
          console.log(`[Screenshot] Capturing via E2B for project ${projectId}:`, captureUrl)

          const screenshot = await captureSandboxScreenshot(projectId, {
            sandboxUrl: captureUrl,
            width,
            height,
            waitForLoad: 3000, // Increased wait time for better reliability
          })

          if (screenshot) {
            // Validate the screenshot data
            if (screenshot.startsWith('data:image/png;base64,')) {
              const base64Data = screenshot.split(',')[1]
              const sizeEstimate = (base64Data.length * 3) / 4 // Rough estimate of decoded size

              if (sizeEstimate < 100) {
                console.warn("[Screenshot] Screenshot data too small, using placeholder")
              } else {
                console.log(`[Screenshot] Successfully captured screenshot (approx ${Math.round(sizeEstimate)} bytes)`)
                return NextResponse.json({
                  screenshot_base64: screenshot,
                  source: "e2b",
                })
              }
            } else {
              console.warn("[Screenshot] Invalid screenshot format, expected PNG base64")
            }
          } else {
            console.warn("[Screenshot] E2B returned null, falling back to placeholder")
          }

          // Fallback path: capture from API host using Playwright.
          // Only permitted for canonical sandbox URLs to avoid user-controlled host access.
          const hostScreenshot = await captureViaHostPlaywright(captureUrl, width, height)
          if (hostScreenshot) {
            console.log("[Screenshot] Captured via host Playwright fallback")
            return NextResponse.json({
              screenshot_base64: hostScreenshot,
              source: "host-playwright",
            })
          }
        }
      } catch (e2bError) {
        console.warn("[Screenshot] E2B screenshot failed, falling back to placeholder:", e2bError)
      }
    } else {
      console.log("[Screenshot] No projectId provided, using placeholder")
    }

    // Fall back to SVG placeholder
    console.log("[Screenshot] Generating placeholder for:", projectName)
    const svg = generateWebsitePreviewSVG(projectName || "Project Preview", url, width, height)
    const base64 = Buffer.from(svg).toString("base64")

    return NextResponse.json({
      screenshot_base64: `data:image/svg+xml;base64,${base64}`,
      source: "placeholder",
    })
  } catch (error) {
    console.error("Screenshot error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to capture screenshot" },
      { status: 500 }
    )
  }
})

/**
 * Generates an SVG that looks like a website preview.
 * This is a fallback when actual screenshot capture isn't available.
 */
function generateWebsitePreviewSVG(
  projectName: string,
  _url: string,
  width: number,
  height: number
): string {
  const truncatedName = projectName.length > 30
    ? projectName.substring(0, 27) + "..."
    : projectName

  // Extract a color from the project name for variety
  const colors = [
    { primary: "#10B981", secondary: "#059669" }, // emerald
    { primary: "#3B82F6", secondary: "#2563EB" }, // blue
    { primary: "#8B5CF6", secondary: "#7C3AED" }, // violet
    { primary: "#F59E0B", secondary: "#D97706" }, // amber
    { primary: "#EF4444", secondary: "#DC2626" }, // red
    { primary: "#EC4899", secondary: "#DB2777" }, // pink
    { primary: "#06B6D4", secondary: "#0891B2" }, // cyan
  ]
  const colorIndex = projectName.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length
  const color = colors[colorIndex]

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#18181B"/>
        <stop offset="100%" style="stop-color:#09090B"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${color.primary}"/>
        <stop offset="100%" style="stop-color:${color.secondary}"/>
      </linearGradient>
    </defs>

    <!-- Background -->
    <rect width="100%" height="100%" fill="url(#bg)"/>

    <!-- Grid pattern -->
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
    </pattern>
    <rect width="100%" height="100%" fill="url(#grid)"/>

    <!-- Browser chrome simulation -->
    <rect x="60" y="40" width="${width - 120}" height="30" rx="8" fill="#27272A"/>
    <circle cx="80" cy="55" r="5" fill="#EF4444"/>
    <circle cx="100" cy="55" r="5" fill="#F59E0B"/>
    <circle cx="120" cy="55" r="5" fill="#22C55E"/>
    <rect x="140" y="47" width="${width - 280}" height="16" rx="4" fill="#3F3F46"/>

    <!-- Preview window -->
    <rect x="60" y="70" width="${width - 120}" height="${height - 130}" rx="0 0 8 8" fill="#09090B" stroke="#27272A"/>

    <!-- Content simulation -->
    <!-- Hero section -->
    <rect x="100" y="110" width="${width - 240}" height="120" rx="4" fill="rgba(255,255,255,0.02)"/>
    <rect x="130" y="130" width="200" height="20" rx="4" fill="url(#accent)" opacity="0.8"/>
    <rect x="130" y="160" width="300" height="12" rx="2" fill="rgba(255,255,255,0.15)"/>
    <rect x="130" y="180" width="250" height="12" rx="2" fill="rgba(255,255,255,0.1)"/>
    <rect x="130" y="200" width="100" height="24" rx="6" fill="url(#accent)"/>

    <!-- Cards simulation -->
    <rect x="100" y="250" width="${(width - 280) / 3}" height="100" rx="8" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.05)"/>
    <rect x="${120 + (width - 280) / 3}" y="250" width="${(width - 280) / 3}" height="100" rx="8" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.05)"/>
    <rect x="${140 + 2 * (width - 280) / 3}" y="250" width="${(width - 280) / 3}" height="100" rx="8" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.05)"/>

    <!-- Project name overlay -->
    <rect x="${width / 2 - 150}" y="${height - 90}" width="300" height="50" rx="8" fill="rgba(0,0,0,0.7)"/>
    <text x="${width / 2}" y="${height - 58}" font-family="system-ui, sans-serif" font-size="18" font-weight="600" fill="white" text-anchor="middle">${escapeXml(truncatedName)}</text>

    <!-- E2B badge -->
    <rect x="${width - 130}" y="${height - 80}" width="70" height="24" rx="4" fill="url(#accent)" opacity="0.9"/>
    <text x="${width - 95}" y="${height - 63}" font-family="system-ui, sans-serif" font-size="11" font-weight="500" fill="white" text-anchor="middle">Live</text>
  </svg>`
}

function inferPreviewPort(rawUrl: string): number {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.port) {
      const value = parseInt(parsed.port, 10)
      if (!Number.isNaN(value) && value > 0) return value
    }

    const hostPrefix = parsed.hostname.match(/^(\d{2,5})-/)
    if (hostPrefix?.[1]) {
      const value = parseInt(hostPrefix[1], 10)
      if (!Number.isNaN(value) && value > 0) return value
    }
  } catch {
    // Ignore and use default below.
  }

  return 3000
}

function isSafeSandboxPreviewUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== "https:") return false
    return /^[0-9]{2,5}-[a-z0-9-]+\.e2b\.app$/i.test(parsed.hostname)
  } catch {
    return false
  }
}

async function captureViaHostPlaywright(
  targetUrl: string,
  width: number,
  height: number,
): Promise<string | null> {
  try {
    const { chromium } = await import("@playwright/test")

    // Try system Chrome channel first (no bundled browser download needed),
    // then fallback to default Chromium if available.
    const launchOptions: Array<{ channel?: "chrome"; headless: boolean }> = [
      { channel: "chrome", headless: true },
      { headless: true },
    ]

    for (const options of launchOptions) {
      try {
        const browser = await chromium.launch(options)
        try {
          const page = await browser.newPage({
            viewport: { width, height },
          })
          await page.goto(targetUrl, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          })
          try {
            await page.waitForLoadState("networkidle", { timeout: 10000 })
          } catch {
            // Ignore networkidle timeout on pages with persistent connections.
          }
          const imageBuffer = await page.screenshot({
            type: "png",
            fullPage: false,
          })
          return `data:image/png;base64,${imageBuffer.toString("base64")}`
        } finally {
          await browser.close().catch(() => {})
        }
      } catch {
        continue
      }
    }
  } catch (error) {
    console.warn("[Screenshot] Host Playwright fallback unavailable:", error)
  }

  return null
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}
