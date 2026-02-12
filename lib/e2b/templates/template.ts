import { Template, waitForPort } from "e2b";

export const TEMPLATE_NAME = "nextjs-developer";

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
  .runCmd(
    "mv /home/user/nextjs-app/* /home/user/ && rm -rf /home/user/nextjs-app",
  )
  .setWorkdir("/home/user")
  .setStartCmd("npx next dev --turbo", waitForPort(3000));
