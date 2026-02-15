import type { Sandbox } from "e2b";
import { normalizeSandboxPreviewUrl } from "../utils/url";
import { executeCommand } from "./sandbox-commands";
import { writeFile } from "./sandbox-files";
import { checkDevServerHttp } from "./sandbox-devserver";

/**
 * Get the public URL for a port in the sandbox.
 * This is used to expose a running web server to the internet.
 */
export function getHostUrl(sandbox: Sandbox, port: number = 3000): string {
  const host = sandbox.getHost(port);
  const normalized = normalizeSandboxPreviewUrl(host);

  if (!normalized) {
    throw new Error(
      `Invalid sandbox host returned by E2B for port ${port}: ${host}`,
    );
  }

  return normalized;
}

/**
 * Capture a screenshot of a running web server using Playwright.
 * Playwright and Chromium are pre-installed in the E2B template.
 *
 * Falls back to ImageMagick or Python PIL if Playwright fails.
 *
 * @param projectId - Project ID
 * @param options - Screenshot options
 * @returns Base64 encoded screenshot or null if failed
 */
export function resolveInternalSandboxUrl(previewUrl: string): {
  internalUrl: string;
  port: number;
} {
  try {
    const parsed = new URL(previewUrl);
    const hostPortMatch = parsed.hostname.match(/^(\d{2,5})-/);
    const explicitPort = parsed.port ? parseInt(parsed.port, 10) : NaN;
    const hostPrefixPort = hostPortMatch ? parseInt(hostPortMatch[1], 10) : NaN;
    const port = Number.isFinite(explicitPort)
      ? explicitPort
      : Number.isFinite(hostPrefixPort)
        ? hostPrefixPort
        : 3000;

    return {
      internalUrl: `http://127.0.0.1:${port}${parsed.pathname}${parsed.search}${parsed.hash}`,
      port,
    };
  } catch {
    return {
      internalUrl: "http://127.0.0.1:3000",
      port: 3000,
    };
  }
}

export function looksLikeMissingChromium(output: string): boolean {
  const lowered = output.toLowerCase();
  return (
    lowered.includes("executable doesn't exist") ||
    lowered.includes("please run the following command") ||
    lowered.includes("playwright install")
  );
}

export function looksLikeMissingSystemLibs(output: string): boolean {
  const lowered = output.toLowerCase();
  return (
    lowered.includes("error while loading shared libraries") ||
    lowered.includes("cannot open shared object file") ||
    lowered.includes("libglib-2.0.so.0")
  );
}

function getPlaywrightInstallCommand(runtimeDir: string, useBun: boolean): string {
  return useBun
    ? `cd "${runtimeDir}" && bunx playwright install --with-deps chromium || bunx playwright install chromium`
    : `cd "${runtimeDir}" && npx playwright install --with-deps chromium || npx playwright install chromium`;
}

function getChromiumReadyCheckCommand(runtimeDir: string, useBun: boolean): string {
  const runtime = useBun ? "bun" : "node";
  const script =
    "import('playwright').then(async ({ chromium }) => { const { existsSync } = await import('node:fs'); const executablePath = chromium.executablePath(); console.log(existsSync(executablePath) ? 'ready' : 'missing'); }).catch(() => console.log('missing'))";
  return `cd "${runtimeDir}" && ${runtime} -e "${script}"`;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function hasPngSignature(data: Uint8Array): boolean {
  if (data.length < PNG_SIGNATURE.length) return false;
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (data[index] !== PNG_SIGNATURE[index]) {
      return false;
    }
  }
  return true;
}

export async function captureSandboxScreenshot(
  projectId: string,
  options: {
    sandboxUrl?: string;
    width?: number;
    height?: number;
    waitForLoad?: number;
  } = {},
  // Accept getSandbox as injected dependency to avoid circular imports
  sandboxFns: {
    getSandbox: (projectId: string) => Promise<Sandbox | undefined>;
  },
): Promise<string | null> {
  const {
    sandboxUrl,
    width = 1280,
    height = 800,
    waitForLoad = 2000,
  } = options;

  if (!sandboxUrl) {
    console.warn("[Screenshot] No sandbox URL provided");
    return null;
  }

  let sandbox: Sandbox | undefined;
  try {
    // Only capture from an existing/reconnectable sandbox. Do not create a
    // brand-new sandbox for screenshots because that produces mismatched previews.
    sandbox = await sandboxFns.getSandbox(projectId);
    if (!sandbox) {
      console.warn("[Screenshot] No active sandbox available for capture");
      return null;
    }

    const { internalUrl } = resolveInternalSandboxUrl(sandboxUrl);
    console.log(
      `[Screenshot] Capturing ${sandboxUrl} (internal: ${internalUrl}) in sandbox ${sandbox.sandboxId}`,
    );

    const runtimeDir = "/home/user/.codex-screenshot";
    const screenshotPath = `${runtimeDir}/screenshot.png`;
    const screenshotScriptPath = `${runtimeDir}/screenshot.mjs`;

    const runtimeCheck = await executeCommand(
      sandbox,
      `if command -v bun >/dev/null 2>&1; then echo "bun"; elif command -v node >/dev/null 2>&1; then echo "node"; else echo "none"; fi`,
      { timeoutMs: 5000 },
    );
    const runtime = runtimeCheck.stdout.trim();
    const useBun = runtime === "bun";
    const useNode = runtime === "node";

    if (!useBun && !useNode) {
      console.warn("[Screenshot] No supported runtime (bun/node) in sandbox");
      return null;
    }

    await executeCommand(
      sandbox,
      `mkdir -p "${runtimeDir}" && cd "${runtimeDir}" && [ -f package.json ] || echo '{}' > package.json`,
      { timeoutMs: 5000 },
    );

    // Ensure Playwright package is available from /tmp.
    const playwrightCheckCommand = useBun
      ? `cd "${runtimeDir}" && bun -e "import('playwright').then(() => console.log('installed')).catch(() => console.log('missing'))"`
      : `cd "${runtimeDir}" && node -e "import('playwright').then(() => console.log('installed')).catch(() => console.log('missing'))"`;
    const playwrightCheck = await executeCommand(
      sandbox,
      playwrightCheckCommand,
      { timeoutMs: 10000 },
    );
    if (!playwrightCheck.stdout.includes("installed")) {
      console.log("[Screenshot] Playwright not found in runtime dir, installing...");
      const installCommand = useBun
        ? `cd "${runtimeDir}" && bun add playwright`
        : `cd "${runtimeDir}" && npm install --no-fund --no-audit playwright`;
      const installResult = await executeCommand(sandbox, installCommand, {
        timeoutMs: 180000,
      });
      if (installResult.exitCode !== 0) {
        console.warn(
          "[Screenshot] Failed to install Playwright:",
          installResult.stderr || installResult.stdout,
        );
        return null;
      }
    }

    const chromiumCheck = await executeCommand(
      sandbox,
      getChromiumReadyCheckCommand(runtimeDir, useBun),
      { timeoutMs: 10000 },
    );
    if (!chromiumCheck.stdout.includes("ready")) {
      console.log("[Screenshot] Chromium browser missing, installing...");
      const browserInstall = await executeCommand(
        sandbox,
        getPlaywrightInstallCommand(runtimeDir, useBun),
        { timeoutMs: 300000 },
      );
      if (browserInstall.exitCode !== 0) {
        console.warn(
          "[Screenshot] Failed to install Chromium browser:",
          browserInstall.stderr || browserInstall.stdout,
        );
        return null;
      }
    }

    // Create a Playwright screenshot script.
    const screenshotScript = `
import { chromium } from "playwright";

async function run() {
  let browser;
  try {
    console.log("Launching browser...");
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu"
      ]
    });

    console.log("Creating page...");
    const page = await browser.newPage({
      viewport: { width: ${width}, height: ${height} }
    });

    console.log("Navigating to ${internalUrl}...");
    await page.goto(${JSON.stringify(internalUrl)}, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    try {
      await page.waitForLoadState("networkidle", { timeout: 10000 });
    } catch {
      // Ignore networkidle timeout for pages with long-lived connections.
    }

    if (${waitForLoad} > 0) {
      await page.waitForTimeout(${waitForLoad});
    }

    console.log("Taking screenshot...");
    await page.screenshot({
      path: ${JSON.stringify(screenshotPath)},
      fullPage: false,
      type: "png"
    });

    console.log("Screenshot captured successfully");
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? (err.stack || err.message) : String(err);
    console.error("Screenshot failed:", message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

await run();
`;
    await writeFile(sandbox, screenshotScriptPath, screenshotScript);
    await executeCommand(sandbox, `rm -f ${screenshotPath}`, {
      timeoutMs: 3000,
    });

    console.log("[Screenshot] Running screenshot script...");
    const runScriptCommand = useBun
      ? `cd "${runtimeDir}" && bun ${screenshotScriptPath}`
      : `cd "${runtimeDir}" && node ${screenshotScriptPath}`;
    let result = await executeCommand(sandbox, runScriptCommand, {
      timeoutMs: 90000,
    });

    if (result.exitCode !== 0) {
      const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`;
      if (
        looksLikeMissingChromium(combinedOutput) ||
        looksLikeMissingSystemLibs(combinedOutput)
      ) {
        console.log(
          "[Screenshot] Playwright runtime missing dependencies, attempting install...",
        );
        const browserInstall = await executeCommand(
          sandbox,
          getPlaywrightInstallCommand(runtimeDir, useBun),
          { timeoutMs: 300000 },
        );
        if (browserInstall.exitCode === 0) {
          result = await executeCommand(sandbox, runScriptCommand, {
            timeoutMs: 90000,
          });
        }
      }
    }

    if (result.exitCode !== 0) {
      console.warn(
        "[Screenshot] Playwright failed:",
        result.stderr || result.stdout,
      );
      throw new Error("Playwright screenshot failed, trying fallback");
    }

    // Read and validate the screenshot file
    console.log("[Screenshot] Reading screenshot file...");
    const screenshotData = await sandbox.files.read(screenshotPath, {
      format: "bytes",
    });

    if (!screenshotData || screenshotData.length === 0) {
      throw new Error("Screenshot file is empty");
    }

    if (screenshotData.length < 100) {
      throw new Error("Screenshot file too small, likely corrupted");
    }

    if (!hasPngSignature(screenshotData)) {
      throw new Error("Screenshot output is not a valid PNG");
    }

    // Convert to base64
    const base64 = Buffer.from(screenshotData).toString("base64");
    console.log(
      `[Screenshot] Captured successfully, size: ${screenshotData.length} bytes`,
    );

    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.warn(
      "[Screenshot] Primary method failed:",
      error instanceof Error ? error.message : error,
    );

    // Fallback: Check if the internal dev server endpoint is reachable.
    if (sandbox) {
      try {
        const { port } = resolveInternalSandboxUrl(sandboxUrl);
        console.log("[Screenshot] Verifying URL is accessible...");
        const httpCheck = await checkDevServerHttp(sandbox, port);
        console.log(`[Screenshot] URL check result: ${httpCheck.httpCode}`);

        if (!httpCheck.ok) {
          console.warn(
            "[Screenshot] URL not accessible, got status:",
            httpCheck.httpCode,
          );
        }
      } catch (checkError) {
        console.warn("[Screenshot] URL check failed:", checkError);
      }
    }

    // Return null to let the API route generate a placeholder
    console.log(
      "[Screenshot] Returning null to trigger placeholder generation",
    );
    return null;
  }
}
