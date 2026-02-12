import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Template, defaultBuildLogger } from "e2b";
import { template as nextJSTemplate, TEMPLATE_NAME } from "./template";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from project root first, then local cwd fallback
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });
dotenv.config();

async function main() {
  if (!process.env.E2B_API_KEY) {
    throw new Error(
      "Missing E2B_API_KEY. Set it in .env.local or export it before running build.",
    );
  }

  console.log(`Building E2B template: ${TEMPLATE_NAME}`);

  const buildInfo = await Template.build(nextJSTemplate, TEMPLATE_NAME, {
    cpuCount: 4,
    memoryMB: 4096,
    onBuildLogs: defaultBuildLogger(),
  });

  console.log("");
  console.log("Template built successfully.");
  console.log(`Template ID: ${buildInfo.templateId}`);
  console.log(`Build ID: ${buildInfo.buildId}`);
  console.log("");
  console.log("Set one of these in .env.local:");
  console.log(`E2B_TEMPLATE=${buildInfo.templateId}    # preferred`);
  console.log(`E2B_TEMPLATE_ID=${buildInfo.templateId} # legacy`);
}

main().catch((error) => {
  console.error("Template build failed:", error);
  process.exit(1);
});
