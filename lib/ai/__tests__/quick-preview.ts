import { createSandbox, checkDevServerStatus, getHostUrl } from "../../e2b/sandbox"

async function main() {
  const projectId = crypto.randomUUID()
  console.log("🚀 Creating sandbox for Gemini test")
  console.log("   Project ID:", projectId)
  
  const response = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{
        id: "msg-1",
        role: "user",
        content: "Build a simple counter app called 'quick-counter' with a big number display, + and - buttons, and a reset button. Use initializeProject if needed, then write files with batchWriteFiles or writeFile. Do it immediately - no explanation needed.",
        parts: [{ type: "text", text: "Build a simple counter app called 'quick-counter' with a big number display, + and - buttons, and a reset button. Use initializeProject if needed, then write files with batchWriteFiles or writeFile. Do it immediately - no explanation needed." }],
        createdAt: new Date().toISOString()
      }],
      projectId,
      model: "google"
    })
  })

  console.log("📤 Request sent, waiting for response...")
  
  // Wait for response to complete
  const reader = response.body?.getReader()
  if (reader) {
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }
  }

  console.log("✅ Response complete, checking dev server...")

  // Check dev server
  for (let i = 0; i < 20; i++) {
    try {
      const sandbox = await createSandbox(projectId)
      const status = await checkDevServerStatus(sandbox)
      if (status.isRunning && status.port) {
        const url = getHostUrl(sandbox, status.port)
        console.log("\n" + "=".repeat(60))
        console.log("🎉 SUCCESS! Counter app is live!")
        console.log("=".repeat(60))
        console.log(`\n📱 Preview URL: ${url}\n`)
        console.log("The sandbox will remain active for ~30 minutes.")
        console.log("Open the URL in your browser to see the counter app!\n")
        return
      }
    } catch (e) {
      // ignore
    }
    await new Promise(r => setTimeout(r, 3000))
    process.stdout.write(".")
  }
  console.log("\n❌ Dev server didn't start within timeout")
}

main().catch(console.error)
