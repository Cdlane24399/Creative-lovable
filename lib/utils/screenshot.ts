/**
 * Screenshot capture utilities for Creative Lovable
 *
 * Uses E2B Desktop SDK's native screenshot capability for capturing
 * sandbox previews. Falls back to placeholder images when needed.
 */

// Client-side: Request screenshot from server using E2B Desktop SDK
export async function captureScreenshot(
  sandboxUrl: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    projectId?: string;
    projectName?: string;
  } = {},
): Promise<string | null> {
  const {
    width = 1200,
    height = 630,
    quality = 0.8,
    projectId,
    projectName = "Project Preview",
  } = options;

  try {
    // Use E2B Desktop SDK for screenshots via server-side API
    const response = await fetch("/api/screenshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: sandboxUrl,
        projectId,
        projectName,
        width,
        height,
        quality,
      }),
    });

    if (!response.ok) {
      console.warn("Screenshot service unavailable, using fallback");
      return null;
    }

    const data = await response.json();
    return data.screenshot_base64 || null;
  } catch (error) {
    console.error("Error capturing screenshot:", error);
    return null;
  }
}

// Generate a placeholder image with project info
export function generatePlaceholderImage(
  projectName: string,
  options: { width?: number; height?: number } = {},
): string {
  const { width = 400, height = 250 } = options;

  // Create a canvas element
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) return "";

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#18181B");
  gradient.addColorStop(1, "#09090B");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Add subtle grid pattern
  ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
  ctx.lineWidth = 1;
  const gridSize = 30;
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Add icon in center
  ctx.fillStyle = "#10B981";
  ctx.beginPath();
  ctx.arc(width / 2, height / 2 - 20, 30, 0, Math.PI * 2);
  ctx.fill();

  // Add code brackets icon
  ctx.fillStyle = "#18181B";
  ctx.font = "bold 24px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("< />", width / 2, height / 2 - 20);

  // Add project name
  ctx.fillStyle = "#FAFAFA";
  ctx.font = "600 16px system-ui, sans-serif";
  ctx.fillText(truncateText(projectName, 30), width / 2, height / 2 + 35);

  // Add subtle branding
  ctx.fillStyle = "#71717A";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Created with Lumi", width / 2, height - 20);

  return canvas.toDataURL("image/png", 0.9);
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + "...";
}
