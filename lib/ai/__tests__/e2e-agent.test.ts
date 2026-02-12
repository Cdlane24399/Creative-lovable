/**
 * End-to-End Tests for Agentic Logic
 * Tests both Claude and Gemini models creating apps that show in preview
 *
 * Run with: npx tsx lib/ai/__tests__/e2e-agent.test.ts
 */

import { createSandbox, closeSandbox, checkDevServerStatus, getHostUrl } from "../../e2b/sandbox"

// Check environment
const requiredEnvVars = ["E2B_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"]
const missingVars = requiredEnvVars.filter(v => !process.env[v])

if (missingVars.length > 0) {
  console.error(`❌ Missing environment variables: ${missingVars.join(", ")}`)
  process.exit(1)
}

// Types
interface TestResult {
  model: string
  projectId: string
  success: boolean
  sandboxCreated: boolean
  devServerRunning: boolean
  previewUrl: string | null
  filesCreated: string[]
  duration: number
  error?: string
}

interface StreamEvent {
  type: string
  content?: string
  toolName?: string
  args?: Record<string, unknown>
  result?: unknown
}

// Test configuration
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000"
const MODELS = [
  { key: "anthropic", name: "Claude Sonnet 4" },
  { key: "google", name: "Gemini 3 Flash" },
] as const

// Generate UUID v4
function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const TEST_PROMPT = `Build a counter app called "counter-app" with:
- A large number display showing the current count
- Increment and decrement buttons
- A reset button
- Dark theme styling
- Smooth animations

Use the modern tool flow: initializeProject if needed, then write files with batchWriteFiles or writeFile, and sync project changes.
Do not explain - immediately perform the tool calls.`

// Parse AI SDK SSE stream
async function parseStreamResponse(response: Response): Promise<{
  text: string
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result?: unknown }>
  events: StreamEvent[]
}> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("No response body")

  const decoder = new TextDecoder()
  let text = ""
  const toolCalls: Array<{ name: string; args: Record<string, unknown>; result?: unknown }> = []
  const events: StreamEvent[] = []
  let buffer = ""
  let lineCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""

    for (const line of lines) {
      if (!line.trim()) continue
      lineCount++

      // SSE format: "data: {...}"
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6) // Remove "data: " prefix
        try {
          const parsed = JSON.parse(jsonStr)
          events.push(parsed)

          // Handle text-delta events
          if (parsed.type === "text-delta" && parsed.delta) {
            text += parsed.delta
            process.stdout.write(parsed.delta)
          }

          // Handle tool-call events
          if (parsed.type === "tool-call") {
            console.log(`\n  🔧 Tool completed: ${parsed.toolName}`)
            // Update existing tool call with final args
            const existingCall = toolCalls.find(t => t.name === parsed.toolName)
            if (existingCall) {
              existingCall.args = parsed.args || existingCall.args
            } else {
              toolCalls.push({
                name: parsed.toolName,
                args: parsed.args || {},
              })
            }
          }

          // Handle tool-input-start events (tool is being called)
          if (parsed.type === "tool-input-start") {
            console.log(`\n  🔧 Tool calling: ${parsed.toolName}`)
            toolCalls.push({
              name: parsed.toolName,
              args: {},
            })
          }

          // Handle tool-result events
          if (parsed.type === "tool-result") {
            console.log(`\n  📦 Tool result for: ${parsed.toolName}`)
            const existingCall = toolCalls.find(t => t.name === parsed.toolName)
            if (existingCall) {
              existingCall.result = parsed.result
            }
            // Try to extract preview URL from result
            if (parsed.result && typeof parsed.result === "object") {
              const result = parsed.result as Record<string, unknown>
              if (result.previewUrl) {
                console.log(`  🌐 Preview URL: ${result.previewUrl}`)
              }
              if (result.url) {
                console.log(`  🌐 URL: ${result.url}`)
              }
            }
          }
        } catch (e) {
          // Log parse errors for debugging
          if (lineCount <= 10) {
            console.log(`  [Parse error]: ${(e as Error).message} - Line: ${line.substring(0, 50)}`)
          }
        }
      }
    }
  }

  console.log(`\n  [Stream complete: ${lineCount} lines, ${text.length} chars, ${toolCalls.length} tools]`)
  return { text, toolCalls, events }
}

// Make chat request
async function sendChatMessage(
  projectId: string,
  model: string,
  message: string
): Promise<{ text: string; toolCalls: Array<{ name: string; args: Record<string, unknown> }> }> {
  const msgId = `msg-${Date.now()}`
  const response = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          id: msgId,
          role: "user",
          content: message,
          parts: [{ type: "text", text: message }],
          createdAt: new Date().toISOString(),
        },
      ],
      projectId,
      model,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Chat API error: ${response.status} - ${error}`)
  }

  return parseStreamResponse(response)
}

// Wait for dev server with timeout
async function waitForDevServer(
  projectId: string,
  timeoutMs: number = 120000
): Promise<{ isRunning: boolean; url: string | null }> {
  const startTime = Date.now()
  let lastStatus: { isRunning: boolean; url: string | null } = { isRunning: false, url: null }

  while (Date.now() - startTime < timeoutMs) {
    try {
      const sandbox = await createSandbox(projectId)
      const status = await checkDevServerStatus(sandbox)

      if (status.isRunning && status.port) {
        // Get the actual URL using the sandbox's getHost function
        const url = getHostUrl(sandbox, status.port)
        console.log(`  ✅ Dev server running at ${url}`)
        return { isRunning: true, url }
      }

      lastStatus = {
        isRunning: status.isRunning,
        url: status.port ? getHostUrl(sandbox, status.port) : null
      }
    } catch (error) {
      // Sandbox might not be ready yet
    }

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, 3000))
    process.stdout.write(".")
  }

  return lastStatus
}

// Run test for a single model
async function testModel(
  modelKey: string,
  modelName: string
): Promise<TestResult> {
  const projectId = generateUUID()
  const startTime = Date.now()

  console.log(`\n${"=".repeat(60)}`)
  console.log(`🧪 Testing ${modelName} (${modelKey})`)
  console.log(`   Project ID: ${projectId}`)
  console.log(`${"=".repeat(60)}\n`)

  const result: TestResult = {
    model: modelKey,
    projectId,
    success: false,
    sandboxCreated: false,
    devServerRunning: false,
    previewUrl: null,
    filesCreated: [],
    duration: 0,
  }

  try {
    // Step 1: Send chat message to create the app
    console.log("📤 Sending prompt to create counter app...\n")
    const { text, toolCalls } = await sendChatMessage(projectId, modelKey, TEST_PROMPT)

    console.log(`\n\n📝 Response received (${text.length} chars)`)
    console.log(`🔧 Tool calls made: ${toolCalls.length}`)

    // Check what tools were called
    const initializeProjectCalls = toolCalls.filter(t => t.name === "initializeProject")
    const batchWriteFilesCalls = toolCalls.filter(t => t.name === "batchWriteFiles")
    const writeFileCalls = toolCalls.filter(t => t.name === "writeFile")

    if (initializeProjectCalls.length > 0) {
      console.log(`  ✅ initializeProject called ${initializeProjectCalls.length} time(s)`)
    }

    if (batchWriteFilesCalls.length > 0) {
      console.log(`  ✅ batchWriteFiles called ${batchWriteFilesCalls.length} time(s)`)
    }

    const batchWritePaths: string[] = []
    for (const call of batchWriteFilesCalls) {
      const files = call.args.files
      if (!Array.isArray(files)) continue
      for (const file of files) {
        if (
          typeof file === "object" &&
          file !== null &&
          "path" in file &&
          typeof (file as { path: unknown }).path === "string"
        ) {
          batchWritePaths.push((file as { path: string }).path)
        }
      }
    }

    const writeFilePaths = writeFileCalls
      .map((t) => t.args.path)
      .filter((path): path is string => typeof path === "string")

    result.filesCreated = [...new Set([...batchWritePaths, ...writeFilePaths])]
    result.sandboxCreated =
      initializeProjectCalls.length > 0 ||
      batchWriteFilesCalls.length > 0 ||
      writeFileCalls.length > 0

    if (writeFileCalls.length > 0) {
      console.log(`  ✅ writeFile called ${writeFileCalls.length} time(s)`)
    }

    // Step 2: Wait for dev server to start
    console.log("\n⏳ Waiting for dev server to start...")
    const serverStatus = await waitForDevServer(projectId, 180000)

    result.devServerRunning = serverStatus.isRunning
    result.previewUrl = serverStatus.url

    if (serverStatus.isRunning) {
      console.log(`\n🎉 Preview available at: ${serverStatus.url}`)
      result.success = true
    } else {
      console.log("\n⚠️  Dev server did not start within timeout")
    }

  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    console.error(`\n❌ Error: ${result.error}`)
  } finally {
    result.duration = Date.now() - startTime
    console.log(`\n⏱️  Duration: ${(result.duration / 1000).toFixed(1)}s`)

    // Cleanup sandbox
    try {
      await closeSandbox(projectId)
      console.log("🧹 Sandbox cleaned up")
    } catch {
      // Ignore cleanup errors
    }
  }

  return result
}

// Main test runner
async function runE2ETests() {
  console.log("\n" + "🚀".repeat(30))
  console.log("\n  🧪 E2E AGENTIC LOGIC TESTS")
  console.log(`  📅 ${new Date().toISOString()}`)
  console.log(`  🌐 Base URL: ${BASE_URL}`)
  console.log("\n" + "🚀".repeat(30))

  // Verify server is running
  try {
    const healthCheck = await fetch(`${BASE_URL}/api/init-db`)
    if (!healthCheck.ok) {
      console.error("\n❌ Server not responding. Make sure to run: npm run dev")
      process.exit(1)
    }
    console.log("\n✅ Server is running")
  } catch (error) {
    console.error("\n❌ Cannot connect to server. Make sure to run: npm run dev")
    process.exit(1)
  }

  const results: TestResult[] = []

  // Run tests for each model
  for (const { key, name } of MODELS) {
    const result = await testModel(key, name)
    results.push(result)

    // Brief pause between tests
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  // Summary
  console.log("\n\n" + "=".repeat(60))
  console.log("📊 TEST RESULTS SUMMARY")
  console.log("=".repeat(60))

  const tableRows = results.map(r => ({
    Model: r.model,
    Success: r.success ? "✅" : "❌",
    "Project Tools": r.sandboxCreated ? "✅" : "❌",
    "Dev Server": r.devServerRunning ? "✅" : "❌",
    Duration: `${(r.duration / 1000).toFixed(1)}s`,
    "Preview URL": r.previewUrl || "N/A",
  }))

  console.table(tableRows)

  // Detailed results
  console.log("\n📋 DETAILED RESULTS:")
  for (const r of results) {
    console.log(`\n  ${r.model}:`)
    console.log(`    Project ID: ${r.projectId}`)
    console.log(`    Files Created: ${r.filesCreated.length}`)
    if (r.filesCreated.length > 0) {
      r.filesCreated.slice(0, 5).forEach(f => console.log(`      - ${f}`))
      if (r.filesCreated.length > 5) {
        console.log(`      ... and ${r.filesCreated.length - 5} more`)
      }
    }
    if (r.error) {
      console.log(`    Error: ${r.error}`)
    }
    if (r.previewUrl) {
      console.log(`    Preview: ${r.previewUrl}`)
    }
  }

  // Overall result
  const allPassed = results.every(r => r.success)
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

  console.log("\n" + "=".repeat(60))
  if (allPassed) {
    console.log("🎉 ALL TESTS PASSED!")
  } else {
    const failedCount = results.filter(r => !r.success).length
    console.log(`⚠️  ${failedCount}/${results.length} TESTS FAILED`)
  }
  console.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`)
  console.log("=".repeat(60) + "\n")

  process.exit(allPassed ? 0 : 1)
}

// Run tests
runE2ETests().catch(error => {
  console.error("Fatal error:", error)
  process.exit(1)
})
