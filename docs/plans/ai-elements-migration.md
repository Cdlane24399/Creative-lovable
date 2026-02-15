# AI Elements Migration Plan

Migrate the custom chat UI in `components/chat/` to use the `ai-elements` component library, replacing hand-rolled components with composable, maintained primitives from the registry.

---

## Component Mapping

| Current Component                              | ai-elements Replacement                                                                                                            | Notes                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `components/chat/message.tsx`                  | `Message`, `MessageContent`, `MessageResponse`                                                                                     | Composable message with markdown rendering via `MessageResponse` |
| `components/chat/message-list.tsx`             | `Conversation`, `ConversationContent`, `ConversationScrollButton`, `ConversationEmptyState`                                        | Built-in auto-scroll + scroll button + empty state               |
| `components/chat/prompt-input.tsx`             | `PromptInput`, `PromptInputTextarea`, `PromptInputSubmit`, `PromptInputFooter`, `PromptInputTools`, `PromptInputSelect*`           | Full-featured input with model selector, attachments, toolbars   |
| `components/chat/tool-result-item.tsx`         | `Tool`, `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput`                                                                     | Collapsible tool display with state badges                       |
| `components/chat/tool-approval.tsx`            | `Confirmation`, `ConfirmationRequest`, `ConfirmationAccepted`, `ConfirmationRejected`, `ConfirmationActions`, `ConfirmationAction` | Full approval workflow with state-driven rendering               |
| `components/chat/thinking-section.tsx`         | `Reasoning`, `ReasoningTrigger`, `ReasoningContent`                                                                                | Auto-open/close during streaming, duration display               |
| `components/chat/suggestion-chips.tsx`         | `Suggestions`, `Suggestion`                                                                                                        | Horizontal scrollable suggestion buttons                         |
| `components/chat/plan-progress.tsx`            | `Task`, `TaskTrigger`, `TaskContent`, `TaskItem`                                                                                   | Collapsible task list with status indicators                     |
| `components/chat/chat-markdown.tsx`            | `MessageResponse` (built into message)                                                                                             | GFM, math, code highlighting built-in                            |
| `components/chat/chat-error.tsx` (empty state) | `ConversationEmptyState`                                                                                                           | Icon + title + description pattern                               |
| Model selector in prompt-input                 | `PromptInputSelect*` or `ModelSelector`                                                                                            | Built-in select in footer or standalone dialog                   |

### Additional ai-elements components to consider

| Component                          | Use Case                                                           |
| ---------------------------------- | ------------------------------------------------------------------ |
| `CodeBlock`                        | Replace prose-based code rendering with Shiki syntax highlighting  |
| `Terminal`                         | Display `runCommand` / `executeCode` tool output with ANSI support |
| `FileTree`                         | Display `getProjectStructure` results in expandable tree           |
| `Shimmer`                          | Loading states during streaming                                    |
| `ConversationDownload`             | Export conversation as Markdown                                    |
| `MessageActions` / `MessageAction` | Add copy/retry/like buttons to messages                            |

---

## Migration Steps

### Phase 1: Install ai-elements components

```bash
npx ai-elements@latest add message
npx ai-elements@latest add conversation
npx ai-elements@latest add prompt-input
npx ai-elements@latest add tool
npx ai-elements@latest add confirmation
npx ai-elements@latest add reasoning
npx ai-elements@latest add suggestion
npx ai-elements@latest add task
npx ai-elements@latest add code-block
npx ai-elements@latest add shimmer
```

This creates `components/ai-elements/` with all component source files.

### Phase 2: Migrate MessageList -> Conversation

**Current**: `components/chat/message-list.tsx` (custom auto-scroll, dedup, typing indicators)

**Target**: Replace with `Conversation` + `ConversationContent` + `ConversationScrollButton`

**File**: `components/chat/message-list.tsx`

Changes:

1. Replace the custom scroll container with `<Conversation>` and `<ConversationContent>`
2. Replace custom scroll-to-bottom button with `<ConversationScrollButton />`
3. Replace `ChatEmptyState` with `<ConversationEmptyState icon={...} title="..." description="..." />`
4. Keep typing/tool-calling indicators as custom additions inside `ConversationContent`
5. Keep message deduplication logic (filter by unique ID)
6. Keep `React.memo` with custom equality check

**Preserving custom behavior**:

- Typing dots animation (3 bounce dots) - keep as-is, insert after messages
- Tool calling spinner ("Working...") - keep as-is
- Suggestion chips rendering logic - migrate to `<Suggestions>` / `<Suggestion>`
- Heuristic suggestion builder `buildHeuristicSuggestions` - keep function, pass output to `<Suggestions>`

### Phase 3: Migrate Message rendering

**Current**: `components/chat/message.tsx` (complex tool parsing, thinking, markdown)

**Target**: `Message` + `MessageContent` + `MessageResponse` from ai-elements

**File**: `components/chat/message.tsx`

Changes:

1. Replace user message div with `<Message from="user"><MessageContent><MessageResponse>{text}</MessageResponse></MessageContent></Message>`
2. Replace assistant message div with `<Message from="assistant"><MessageContent>...</MessageContent></Message>`
3. Replace `ChatMarkdown` usage with `<MessageResponse>{text}</MessageResponse>` (has built-in GFM, math, streaming markdown)
4. Keep tool part iteration logic - map tool parts to `<Tool>` components (Phase 4)
5. Move thinking display to `<Reasoning>` components (Phase 5)
6. Add `<MessageActions>` with copy button on assistant messages

**Key difference**: ai-elements `Message` uses `from` prop (role), applies styling via CSS group classes (`is-user`, `is-assistant`). User messages get `bg-primary text-primary-foreground`. Must verify dark theme compatibility with the project's `#111111` background.

**Dark theme concern**: The project uses a very dark zinc-based theme (`bg-[#111111]`, `bg-zinc-800/80`). ai-elements uses shadcn/ui theme variables. Must ensure the shadcn/ui theme is configured to match the existing dark aesthetic. May need to customize CSS variables in `globals.css`.

### Phase 4: Migrate ToolResultItem -> Tool

**Current**: `components/chat/tool-result-item.tsx` (action icons, path display, collapsible content)

**Target**: `Tool` + `ToolHeader` + `ToolContent` + `ToolInput` + `ToolOutput`

**File**: `components/chat/message.tsx` (tool rendering section)

Changes:

1. Replace `ToolResultItem` calls with composable `<Tool>` structure
2. Map tool states: current `ToolState` matches ai-elements states exactly (`input-streaming`, `input-available`, `output-available`, `output-error`, `approval-requested`)
3. `ToolHeader` accepts `type` (e.g., `"tool-writeFile"`) and `state` - renders status badge + title automatically
4. For file tools (writeFile, editFile, readFile): render `<ToolOutput>` with file path and content
5. For batchWriteFiles: expand to multiple `<Tool>` components (keep existing expansion logic)
6. For runCommand/executeCode output: consider using `<Terminal>` inside `<ToolOutput>` for ANSI support

**Custom title mapping**: Current code maps tool names to actions ("writeFile" -> "Created"). ai-elements `ToolHeader` derives title from the `type` prop. Use the `title` prop override to preserve current labels:

```tsx
<ToolHeader type="tool-writeFile" state={state} title="Created file.tsx" />
```

### Phase 5: Migrate ThinkingSection -> Reasoning

**Current**: `components/chat/thinking-section.tsx` (collapsible, first-line preview, bold parsing)

**Target**: `Reasoning` + `ReasoningTrigger` + `ReasoningContent`

**File**: `components/chat/message.tsx` (thinking section in assistant messages)

Changes:

1. Replace `<ThinkingSection content={thinkingContent} />` with:
   ```tsx
   <Reasoning isStreaming={isReasoningStreaming} duration={thinkingTime}>
     <ReasoningTrigger />
     <ReasoningContent>{thinkingContent}</ReasoningContent>
   </Reasoning>
   ```
2. `ReasoningTrigger` auto-generates "Thinking..." / "Thought for Xs" text
3. `ReasoningContent` renders via Streamdown (same library currently used)
4. Remove the fallback "Thought for Xs" div - `Reasoning` handles duration display natively

### Phase 6: Migrate ToolApproval -> Confirmation

**Current**: `components/chat/tool-approval.tsx` (Shield icon, approve/deny buttons)

**Target**: `Confirmation` + `ConfirmationRequest` + `ConfirmationActions` + `ConfirmationAction`

**File**: `components/chat/message.tsx` (approval rendering for tool parts)

Changes:

1. Replace inline `<ToolApproval>` with:
   ```tsx
   <Confirmation approval={toolPart.approval} state={toolPart.state}>
     <ConfirmationRequest>
       {getToolLabel(toolName)}: {getInputSummary(toolName, input)}
     </ConfirmationRequest>
     <ConfirmationAccepted>Approved</ConfirmationAccepted>
     <ConfirmationRejected>Denied</ConfirmationRejected>
     <ConfirmationActions>
       <ConfirmationAction
         variant="outline"
         onClick={() => onToolDeny(toolCallId)}
       >
         Deny
       </ConfirmationAction>
       <ConfirmationAction onClick={() => onToolApprove(toolCallId)}>
         Approve
       </ConfirmationAction>
     </ConfirmationActions>
   </Confirmation>
   ```
2. Must verify that the tool approval flow uses the `approval` field from AI SDK v6's `ToolUIPart`. Currently the code uses custom `state === "approval-requested"` checks and manual callback props. Need to verify if `addToolApprovalResponse` sets the `approval` field on the part or if adaptation is needed.

### Phase 7: Migrate SuggestionChips -> Suggestions

**Current**: `components/chat/suggestion-chips.tsx` (icon mapping, heuristic builder)

**Target**: `Suggestions` + `Suggestion`

**File**: `components/chat/message-list.tsx` (rendered after last assistant message)

Changes:

1. Replace `<SuggestionChips suggestions={suggestions} onSelect={onSelect} />` with:
   ```tsx
   <Suggestions>
     {suggestions.map((s) => (
       <Suggestion key={s} suggestion={s} onClick={onSelectSuggestion} />
     ))}
   </Suggestions>
   ```
2. Keep `buildHeuristicSuggestions` function - it generates the string array
3. The smart icon mapping from current code will be lost (ai-elements `Suggestion` is text-only buttons). If icons are important, can extend `Suggestion` since we own the source.

### Phase 8: Migrate PlanProgress -> Task

**Current**: `components/chat/plan-progress.tsx` (floating checklist, fuzzy matching, auto-dismiss)

**Target**: `Task` + `TaskTrigger` + `TaskContent` + `TaskItem`

**File**: `components/chat-panel.tsx` (rendered above input)

Changes:

1. Replace `<PlanProgress plan={plan} isWorking={isWorking} />` with:
   ```tsx
   <Task defaultOpen>
     <TaskTrigger title={plan.goal} />
     <TaskContent>
       {plan.steps.map((step, i) => (
         <TaskItem key={i}>{step.label}</TaskItem>
       ))}
     </TaskContent>
   </Task>
   ```
2. Keep plan extraction logic (scanning for planChanges/markStepComplete tools)
3. Keep fuzzy matching for step completion
4. Keep auto-dismiss behavior (3s after all complete) - add wrapper logic
5. ai-elements `Task` component doesn't have built-in progress bar or step status indicators at the level of detail we have. May need to extend or keep custom progress rendering.

### Phase 9: Migrate PromptInput

**Current**: `components/chat/prompt-input.tsx` (textarea, model selector, improve button, sparkle effect)

**Target**: `PromptInput` + `PromptInputTextarea` + `PromptInputSubmit` + `PromptInputFooter` + `PromptInputTools` + `PromptInputSelect*`

**File**: `components/chat/prompt-input.tsx`

Changes:

1. Replace form/textarea with `<PromptInput onSubmit={handleSubmit}>`:
   ```tsx
   <PromptInput onSubmit={handleSubmit}>
     <PromptInputBody>
       <PromptInputTextarea value={input} onChange={...} />
     </PromptInputBody>
     <PromptInputFooter>
       <PromptInputTools>
         {/* Improve prompt button - keep custom */}
         <PromptInputSelect value={model} onValueChange={setModel}>
           <PromptInputSelectTrigger>
             <PromptInputSelectValue />
           </PromptInputSelectTrigger>
           <PromptInputSelectContent>
             {models.map(m => (
               <PromptInputSelectItem key={m.key} value={m.key}>
                 {m.label}
               </PromptInputSelectItem>
             ))}
           </PromptInputSelectContent>
         </PromptInputSelect>
       </PromptInputTools>
       <PromptInputSubmit status={chatStatus} />
     </PromptInputFooter>
   </PromptInput>
   ```
2. Keep the "Improve Prompt" button as a custom `PromptInputButton` with tooltip
3. Keep sparkle effect as custom overlay
4. `PromptInputSubmit` handles send/stop icons automatically based on `status`
5. Keep keyboard shortcuts (Enter to send, Shift+Enter newline, Escape stop)

### Phase 10: Remove old components, delete chat-markdown.tsx

After migration:

1. Delete `components/chat/chat-markdown.tsx` - replaced by `MessageResponse`
2. Delete `components/chat/thinking-section.tsx` - replaced by `Reasoning`
3. Delete `components/chat/tool-approval.tsx` - replaced by `Confirmation`
4. Delete `components/chat/suggestion-chips.tsx` - replaced by `Suggestions`
5. Potentially remove `components/chat/tool-result-item.tsx` - replaced by `Tool`
6. Keep `components/chat/chat-error.tsx` for error classification logic (not fully covered by ai-elements)
7. Keep `components/chat/plan-progress.tsx` if `Task` component doesn't cover all custom behavior

### Phase 11: Theme alignment

Ensure the shadcn/ui CSS variables in `globals.css` match the current dark theme:

- Background: `#111111` -> set `--background`
- Card/input: `#1A1A1A` -> set `--card`, `--input`
- Primary accent: emerald-500 -> set `--primary`
- Muted text: zinc-400 -> set `--muted-foreground`
- Borders: white/5 -> set `--border`

Verify ai-elements components render correctly with the dark theme by checking each component visually.

### Phase 12: Testing and validation

1. Verify message rendering (user + assistant) displays correctly
2. Verify streaming markdown renders progressively
3. Verify tool calls display with correct states and transitions
4. Verify tool approval flow works end-to-end
5. Verify thinking/reasoning section opens during streaming, closes after
6. Verify auto-scroll behavior in Conversation
7. Verify model selector persists selection
8. Verify suggestion chips appear after assistant responses
9. Verify plan progress tracks steps correctly
10. Verify keyboard shortcuts (Enter, Shift+Enter, Escape)
11. Run existing tests: `pnpm test`
12. Manual E2E validation of full chat workflow

---

## Risks and Mitigations

| Risk                                                    | Impact                                         | Mitigation                                                                             |
| ------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| Theme mismatch                                          | Visual regression                              | Align CSS variables before component swap; compare screenshots                         |
| Tool approval flow difference                           | Broken approval UX                             | Verify `ToolUIPart.approval` field compatibility with hook's `addToolApprovalResponse` |
| Lost custom tool icons                                  | Reduced visual distinction for file operations | Use `ToolHeader` `title` prop for custom labels; extend if needed                      |
| Heuristic suggestions lose icons                        | Minor UX regression                            | Extend `Suggestion` source to support icons since code is local                        |
| PlanProgress custom features lost                       | Auto-dismiss, progress bar                     | Keep wrapper component with custom logic around `Task`                                 |
| `streamdown` vs `MessageResponse` rendering differences | Markdown rendering differs                     | Both use similar approaches; test with real content                                    |
| Performance regression                                  | Slower re-renders                              | Maintain React.memo patterns; profile if needed                                        |

---

## Dependencies to Add

```bash
# ai-elements installs its own deps, but verify these are present:
# - shiki (for CodeBlock syntax highlighting)
# - stick-to-bottom (for Conversation auto-scroll)
# - rehype-katex, remark-gfm, remark-math (for MessageResponse markdown)
# - ansi-to-react (for Terminal ANSI support)
```

---

## No Changes Required

- `hooks/use-chat-with-tools.ts` - No changes, hook interface stays the same
- `app/api/chat/route.ts` - No changes, API stays the same
- `components/chat-panel.tsx` - Minimal changes (import paths, component names)
- `components/editor-layout.tsx` - No changes
- Tool execution logic - Server-side, unaffected
