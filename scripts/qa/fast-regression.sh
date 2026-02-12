#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "[qa:fast] Typecheck"
pnpm exec tsc --noEmit --pretty false

echo "[qa:fast] Targeted regression tests"
pnpm exec jest --runInBand \
  app/api/projects/screenshot-route.validation.test.ts \
  lib/ai/__tests__/chat-optimizations.test.ts \
  lib/ai/__tests__/project-naming.test.ts \
  lib/e2b/sandbox-screenshot.test.ts \
  lib/e2b/sync-manager.quick-sync.test.ts \
  lib/db/repositories/__tests__/project.repository.ensure-exists.test.ts \
  lib/__tests__/tool-outputs.test.ts

echo "[qa:fast] Completed"
