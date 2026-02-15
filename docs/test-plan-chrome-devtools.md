# Manual E2E Test Plan: Chrome DevTools MCP

This plan tests the full user flow of the Creative-lovable app using Chrome DevTools MCP browser automation. It should be executed in a fresh Claude Code session with access to the Chrome DevTools MCP tools.

## Prerequisites

- Chrome browser open and connected to Chrome DevTools MCP
- Working directory: `/Volumes/ssd/developer/Creative-lovable`
- Environment variables configured (`.env.local` with API keys for at least one AI provider)
- No dev server already running on port 3000

---

## Phase 1: Start the Dev Server

**Action:** Run the Next.js dev server using Bash.

```bash
cd /Volumes/ssd/developer/Creative-lovable && pnpm dev
```

Run this in the background. Wait for the console output `Ready in` before proceeding.

**Success criteria:**
- Console shows `Ready in X.Xs`
- No startup errors

---

## Phase 2: Open the App in Chrome

**Action:** Use `mcp__claude-in-chrome__navigate` to open `http://localhost:3000`.

**Success criteria (verify with `take_screenshot` or `get_page_text`):**
- The landing page loads with the "Lumi" branding
- The hero headline "Ship production apps in minutes, not months" is visible
- The command center input area is visible with a textarea (ID: `landing-prompt-input`)
- The "Build Application" button is visible in the toolbar below the textarea
- A model selector dropdown is visible (defaults to "Claude Sonnet 4.5")

---

## Phase 3: Enter a Prompt

**Action:** Use `mcp__claude-in-chrome__fill` or `mcp__claude-in-chrome__form_input` to type into the textarea with ID `landing-prompt-input`.

**Prompt to enter:**
```
Build a simple counter app with increment and decrement buttons
```

This prompt is chosen because:
- It's simple enough to complete in few agent steps
- It produces a visually verifiable result (buttons + number)
- It doesn't require external packages beyond React/Next.js

**Success criteria:**
- The textarea contains the prompt text
- The "Build Application" button is enabled (not grayed out)

---

## Phase 4: Submit the Prompt

**Action:** Click the "Build Application" button using `mcp__claude-in-chrome__click`. The button is located in the toolbar row below the textarea. It has an ArrowRight icon and white styling.

Alternatively, simulate `Cmd+Enter` using `mcp__claude-in-chrome__press_key`.

**Success criteria (verify within 5 seconds):**
- The browser navigates to a URL matching `/project/[uuid]?prompt=...&model=anthropic`
- The project page loads with a 2-panel layout:
  - **Left panel (450px):** Chat panel with the user's prompt visible as the first message
  - **Right panel:** Preview panel (initially showing a loading state)

---

## Phase 5: Verify Chat Activity

**Action:** Wait 10-15 seconds, then take a screenshot and/or read the page text to observe AI agent activity.

**Success criteria (verify with `take_screenshot` every 10-15 seconds, up to 2 minutes):**

### 5a. Chat Messages Appear
- The user's prompt appears as a right-aligned message in the chat panel
- An assistant response begins streaming (text appears incrementally)
- Tool execution indicators appear, showing one or more of:
  - File creation messages (e.g., "Created app/page.tsx")
  - Package installation messages
  - Build status checks
  - A plan/checklist (floating card showing planned steps with checkmarks)

### 5b. Agent Uses Tools
- The chat shows tool result summaries like:
  - "Created" with file paths (writeFile/batchWriteFiles tool)
  - "Installed" with package names (installPackage tool)
  - "Executed" with command output (runCommand tool)
- At minimum, the agent should create or modify `app/page.tsx` (the main page component)

### 5c. Agent Completes
- The assistant's final message is a text summary explaining what was built
- The chat input returns to idle state with placeholder "Build something wonderful..."
- The send button returns to green (not the red "Stop" state)

---

## Phase 6: Verify the Preview Panel

**Action:** After the agent completes (chat input returns to idle), take a screenshot to observe the preview panel.

**Success criteria:**

### 6a. Dev Server Started
- The preview panel (right side) shows a loaded iframe, NOT a loading spinner
- The editor header shows a URL bar with an E2B sandbox URL (format: `https://3000-[sandboxid].e2b.app`)
- No timeout error message ("Preview took too long to load")

### 6b. Counter App Renders
- The preview iframe displays the generated counter app, which should contain:
  - A visible number (starting at 0)
  - An increment button (labeled "+" or "Increment" or similar)
  - A decrement button (labeled "-" or "Decrement" or similar)
- The app renders without a blank white screen or error page

### 6c. (Optional) Interact with Preview
- If the preview iframe is interactive via MCP tools, try clicking the increment button
- The counter value should increase from 0 to 1

---

## Phase 7: Verify Project Persistence

**Action:** Navigate back to `http://localhost:3000` using `mcp__claude-in-chrome__navigate`.

**Success criteria:**
- The landing page loads (or workspace view if auth is configured)
- If a projects list is visible, the newly created project appears with:
  - A project name derived from the prompt (e.g., "Simple Counter App" or similar)
  - A screenshot thumbnail (may be a placeholder if screenshot capture is slow)
  - A recent timestamp

---

## Phase 8: Send a Follow-up Message

**Action:** Navigate back to the project page (click on the project card, or go to `/project/[uuid]`). In the chat input (ID: `chat-prompt-input`, placeholder: "Build something wonderful..."), type:

```
Change the background color to light blue and make the counter text larger
```

Then press Enter or click the send button (green arrow icon in the bottom-right of the chat input).

**Success criteria:**
- The follow-up message appears in the chat as a new user message
- The AI agent responds with file edits (tool results showing "Edited" operations)
- The preview panel refreshes and shows the updated styling:
  - Light blue background color
  - Larger counter text
- The chat returns to idle state after completion

---

## Overall Pass/Fail Criteria

| # | Criterion | Required |
|---|-----------|----------|
| 1 | Dev server starts without errors | Yes |
| 2 | Landing page renders with prompt input | Yes |
| 3 | Prompt submission navigates to project page | Yes |
| 4 | Chat panel shows user message + AI response | Yes |
| 5 | Tool results appear (file creation/edit) | Yes |
| 6 | Agent completes without error (chat returns to idle) | Yes |
| 7 | Preview panel loads an iframe (not stuck on spinner) | Yes |
| 8 | Generated app renders visually (not blank/error) | Yes |
| 9 | Follow-up message triggers additional edits | Nice-to-have |
| 10 | Project appears in projects list on return to home | Nice-to-have |

**The test passes if criteria 1-8 are all met.**

---

## Troubleshooting

| Symptom | Likely Cause | Action |
|---------|-------------|--------|
| Landing page blank/error | Missing env vars or build error | Check terminal for errors, verify `.env.local` |
| "Build Application" button unresponsive | JS error on page | Check console via `read_console_messages` |
| Chat shows error after prompt submit | API key missing or rate limited | Check `ChatError` component text, verify API keys |
| Preview stuck on spinner | Sandbox creation failed or dev server timeout | Check terminal logs for `[Sandbox]` or `[dev-server]` errors |
| `toolUseId` validation errors in logs | Tool call IDs contain invalid characters | Verify the `sanitizeToolCallIds` fix is applied in `app/api/chat/route.ts` |
| `ReadableStream is locked` errors | Duplicate dev-server POST requests | Verify the 202 dedup fix is applied in `app/api/sandbox/[projectId]/dev-server/route.ts` |
| Two sandboxes created simultaneously | Race condition in sandbox resolution | Verify the `inflightResolves` fix is applied in `lib/e2b/sandbox-lifecycle.ts` |

---

## Notes for Execution

- **Timing:** The full test takes 2-4 minutes depending on AI model response speed and sandbox startup time.
- **Screenshots:** Take screenshots liberally (after each phase) to document state. Use `mcp__claude-in-chrome__gif_creator` for the prompt submission + agent execution sequence.
- **Console:** Use `mcp__claude-in-chrome__read_console_messages` with pattern `[Screenshot]|[Sandbox]|[dev-server]|error` to monitor for backend issues.
- **Auth:** If Supabase auth is configured and required, you may need to sign in first. Check if the landing page shows "Sign In" buttons and handle accordingly. If auth is optional (controlled by env vars), the unauthenticated flow should work.
- **Model selection:** The default model (Claude Sonnet 4.5) requires an Anthropic API key. If unavailable, change the model selector before submitting.
