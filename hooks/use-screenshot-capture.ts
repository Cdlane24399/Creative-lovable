"use client";

import { useCallback } from "react";
import { generatePlaceholderImage } from "@/lib/utils/screenshot";

const debugLog =
  process.env.NODE_ENV === "development" && typeof window !== "undefined"
    ? (...args: Parameters<typeof console.log>) => console.log(...args)
    : () => {};

interface UseScreenshotCaptureOptions {
  projectId: string | undefined;
  saveScreenshot: (base64: string, url?: string) => Promise<boolean>;
}

export function useScreenshotCapture({
  projectId,
  saveScreenshot,
}: UseScreenshotCaptureOptions) {
  const captureAndSaveScreenshot = useCallback(
    async (name: string, url: string, retryCount = 0) => {
      const maxRetries = 2;

      try {
        debugLog(
          `[EditorProvider] Capturing screenshot for ${name} (attempt ${retryCount + 1}/${maxRetries + 1})`,
        );

        const response = await fetch("/api/screenshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            projectName: name,
            projectId: projectId || undefined,
          }),
        });

        if (response.ok) {
          const { screenshot_base64, source } = await response.json();
          if (screenshot_base64) {
            await saveScreenshot(screenshot_base64, url);
            debugLog(
              `[EditorProvider] Screenshot saved for ${name} (source: ${source || "unknown"})`,
            );
            return true;
          } else {
            console.warn("[EditorProvider] No screenshot data returned");
            return false;
          }
        } else {
          const errorText = await response.text();
          console.warn(
            `[EditorProvider] Screenshot API error: ${response.status} - ${errorText}`,
          );
          return false;
        }
      } catch (error) {
        console.warn(
          `[EditorProvider] Screenshot capture error (attempt ${retryCount + 1}):`,
          error,
        );

        if (retryCount < maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, retryCount), 5000);
          debugLog(`[EditorProvider] Retrying in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return captureAndSaveScreenshot(name, url, retryCount + 1);
        }

        console.warn(
          "[EditorProvider] All retries exhausted, using placeholder",
        );
        const placeholder = generatePlaceholderImage(name);
        await saveScreenshot(placeholder, url);
        return false;
      }
    },
    [saveScreenshot, projectId],
  );

  return { captureAndSaveScreenshot };
}
