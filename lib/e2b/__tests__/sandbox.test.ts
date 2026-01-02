/**
 * Integration tests for E2B sandbox functions.
 * Requires E2B_API_KEY environment variable.
 *
 * Run with: npx tsx lib/e2b/__tests__/sandbox.test.ts
 */

import {
  createSandbox,
  closeSandbox,
  startBackgroundProcess,
  killBackgroundProcess,
  executeCommand,
  writeFiles,
  readFile,
} from "../sandbox"

// Check if e2b is available
let e2bAvailable = true
try {
  require("e2b")
} catch {
  e2bAvailable = false
}

// Simple test runner
const tests: Array<{ name: string; fn: () => Promise<void> }> = []
let passed = 0
let failed = 0

function test(name: string, fn: () => Promise<void>) {
  tests.push({ name, fn })
}

async function runTests() {
  console.log("🧪 Running E2B Sandbox Tests\n")

  for (const { name, fn } of tests) {
    try {
      process.stdout.write(`  ${name}... `)
      await fn()
      console.log("✅ PASSED")
      passed++
    } catch (error) {
      console.log("❌ FAILED")
      console.error(`    Error: ${error instanceof Error ? error.message : String(error)}`)
      failed++
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

// Check for E2B_API_KEY
if (!process.env.E2B_API_KEY) {
  console.error("❌ E2B_API_KEY environment variable is required")
  process.exit(1)
}

if (!e2bAvailable) {
  console.error("❌ E2B SDK not available")
  process.exit(1)
}

// Test 1: Background Process with Native API
test("startBackgroundProcess with native API", async () => {
  const projectId = `test-bg-process-${Date.now()}`
  const sandbox = await createSandbox(projectId)

  const result = await startBackgroundProcess(sandbox, "sleep 2", {
    projectId,
  })

  if (!result.started) {
    throw new Error("Process should have started")
  }

  // Cleanup
  await killBackgroundProcess(projectId)
  await closeSandbox(projectId)
})

// Test 2: Command Streaming
test("executeCommand with streaming callbacks", async () => {
  const projectId = `test-streaming-${Date.now()}`
  const sandbox = await createSandbox(projectId)
  const outputs: string[] = []

  await executeCommand(sandbox, 'echo "line1" && echo "line2"', {
    onStdout: (data) => outputs.push(data),
  })

  if (outputs.length === 0) {
    throw new Error("Expected at least one stdout callback")
  }

  await closeSandbox(projectId)
})

// Test 3: Command with cwd option
test("executeCommand with cwd option", async () => {
  const projectId = `test-cwd-${Date.now()}`
  const sandbox = await createSandbox(projectId)

  // Create a test directory and file
  await executeCommand(sandbox, "mkdir -p /tmp/test-dir")
  await executeCommand(sandbox, 'echo "test" > /tmp/test-dir/file.txt')

  // Read file using cwd
  const result = await executeCommand(sandbox, "cat file.txt", {
    cwd: "/tmp/test-dir",
  })

  if (!result.stdout.includes("test")) {
    throw new Error("Expected file content to be read correctly")
  }

  await closeSandbox(projectId)
})

// Test 4: Backward compatibility - number timeout
test("executeCommand backward compatibility with number timeout", async () => {
  const projectId = `test-backward-${Date.now()}`
  const sandbox = await createSandbox(projectId)

  // Old API: second parameter as number
  const result = await executeCommand(sandbox, "echo 'test'", 60000)

  if (result.exitCode !== 0) {
    throw new Error("Command should succeed")
  }

  await closeSandbox(projectId)
})

// Test 5: Batch File Operations - Native API
test("writeFiles with native API", async () => {
  const projectId = `test-batch-native-${Date.now()}`
  const sandbox = await createSandbox(projectId)

  const result = await writeFiles(
    sandbox,
    [
      { path: "/tmp/test-a.txt", content: "content a" },
      { path: "/tmp/test-b.txt", content: "content b" },
    ],
    { useNativeApi: true }
  )

  if (!result.success || result.succeeded !== 2) {
    throw new Error(`Expected 2 files to succeed, got ${result.succeeded}`)
  }

  // Verify files were written
  const fileA = await readFile(sandbox, "/tmp/test-a.txt")
  if (fileA.content.toString() !== "content a") {
    throw new Error("File content mismatch")
  }

  await closeSandbox(projectId)
})

// Test 6: Batch File Operations - Detailed tracking (default)
test("writeFiles with detailed error tracking", async () => {
  const projectId = `test-batch-detailed-${Date.now()}`
  const sandbox = await createSandbox(projectId)

  const result = await writeFiles(sandbox, [
    { path: "/tmp/test-c.txt", content: "content c" },
    { path: "/tmp/test-d.txt", content: "content d" },
  ])

  if (!result.success || result.succeeded !== 2) {
    throw new Error(`Expected 2 files to succeed, got ${result.succeeded}`)
  }

  await closeSandbox(projectId)
})

// Test 7: killBackgroundProcess
test("killBackgroundProcess utility", async () => {
  const projectId = `test-kill-${Date.now()}`
  const sandbox = await createSandbox(projectId)

  await startBackgroundProcess(sandbox, "sleep 60", {
    projectId,
  })

  const killed = await killBackgroundProcess(projectId)
  if (!killed) {
    throw new Error("Process should have been killed")
  }

  // Try to kill again (should return false)
  const killedAgain = await killBackgroundProcess(projectId)
  if (killedAgain) {
    throw new Error("Killing non-existent process should return false")
  }

  await closeSandbox(projectId)
})

// Run all tests
runTests().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
