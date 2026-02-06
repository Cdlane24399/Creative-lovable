import { Template, waitForURL } from "e2b";

export const TEMPLATE_NAME = "nextjs-app-bun";

export const template = Template()
  .fromBunImage("1.3")
  .setWorkdir("/home/user/nextjs-app")
  .runCmd(
    "bun create next-app --app --ts --tailwind --turbopack --yes --use-bun .",
  )
  .runCmd("bunx --bun shadcn@latest init -d")
  .runCmd("bunx --bun shadcn@latest add --all")
  .runCmd(
    "mv /home/user/nextjs-app/* /home/user/ && rm -rf /home/user/nextjs-app",
  )
  .setWorkdir("/home/user")
  .setStartCmd(
    "bun --bun run dev --turbo",
    waitForURL("http://localhost:3000"),
  );
