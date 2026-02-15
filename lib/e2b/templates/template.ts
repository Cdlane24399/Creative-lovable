import { Template, waitForPort } from "e2b";

export const TEMPLATE_NAME = "nextjs-developer";

/**
 * Project must live at /home/user/project — sandbox-provider and getProjectDir
 * expect this path. DO NOT move to /home/user or the template check will fail
 * (package.json, app/, pages/ not found).
 */
const PROJECT_DIR = "/home/user/project";

export const template = Template()
  .fromNodeImage("24-slim")
  .aptInstall("curl")
  .setWorkdir("/home/user/nextjs-app")
  // Scaffold with the current create-next-app defaults using npm.
  // --yes accepts defaults without interactive prompts.
  .runCmd(
    'npx create-next-app@latest . --ts --tailwind --no-eslint --import-alias "@/*" --use-npm --app --no-src-dir --turbopack --yes',
  )
  // Install Tailwind v4 and PostCSS plugin explicitly
  .runCmd("npm install tailwindcss@latest @tailwindcss/postcss@latest tw-animate-css --save-dev")
  // Initialize shadcn with latest version
  .runCmd("npx shadcn@latest init -d -y")
  // Move to PROJECT_DIR so ensureProjectInitialized finds package.json, app/, etc.
  .runCmd(`mkdir -p ${PROJECT_DIR} && mv /home/user/nextjs-app/* ${PROJECT_DIR}/ && rm -rf /home/user/nextjs-app`)
  .setWorkdir(PROJECT_DIR)
  .setStartCmd("npx next dev --turbo", waitForPort(3000));
