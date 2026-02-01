/**
 * Build E2B template using Build System 2.0
 * @see https://e2b.mintlify.app/docs/template/quickstart
 */
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { Template, defaultBuildLogger } from "e2b";
import { template, TEMPLATE_NAME } from "./template";

// Load .env.local from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env.local") });

console.log(`Building E2B template: ${TEMPLATE_NAME}`);

Template.build(template, TEMPLATE_NAME, {
  cpuCount: 4,
  memoryMB: 8192,
  onBuildLogs: defaultBuildLogger(),
})
  .then((buildInfo) => {
    console.log("");
    console.log("✅ Template built successfully!");
    console.log(`   Template ID: ${buildInfo.templateId}`);
    console.log(`   Build ID: ${buildInfo.buildId}`);
    console.log("");
    console.log("Add to .env.local:");
    console.log(`   E2B_TEMPLATE_ID=${buildInfo.templateId}`);
  })
  .catch((error) => {
    console.error("❌ Template build failed:", error);
    process.exit(1);
  });
