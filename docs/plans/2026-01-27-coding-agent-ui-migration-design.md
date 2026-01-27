# Coding Agent UI Migration Design

**Date:** 2026-01-27
**Status:** Approved
**Source:** Claudable chat components (`/Volumes/ssd/developer/Claudable/components/chat/`)

## Overview

Migrate the chat UI from a "task checklist" style to a "coding agent" style that shows file operations inline with expandable details. This provides a better developer experience for seeing what the AI agent is doing.

## Component Architecture

### New Components

```
components/chat/
├── tool-result-item.tsx    # Core: "Edited `file.tsx`" inline display
├── thinking-section.tsx    # Collapsible AI thinking
├── message.tsx             # Updated to use new components
└── tool-call-display.tsx   # Replace current with Claudable style
```

### ToolResultItem

The core visual unit for displaying tool actions.

**Props:**
```typescript
interface ToolResultItemProps {
  action: 'Edited' | 'Created' | 'Read' | 'Deleted' | 'Generated' | 'Searched' | 'Executed'
  filePath: string
  content?: string
  isExpanded?: boolean
  onToggle?: (nextExpanded: boolean) => void
}
```

**Visual structure:**
```
┌─────────────────────────────────────────────────────────┐
│ 📝 Edited  [src/components/Button.tsx]          ›      │
└─────────────────────────────────────────────────────────┘
     ↑        ↑              ↑                    ↑
   icon    action      file path pill         chevron
            verb      (bg-white/10, truncate)  (if expandable)
```

### ThinkingSection

Collapsible AI reasoning display.

**Props:**
```typescript
interface ThinkingSectionProps {
  content: string
  isExpanded?: boolean
}
```

**Behavior:**
- Shows first line as preview ("Thinking: analyzing the component...")
- Click to expand full thinking content
- Supports **bold** markdown in thinking text

## Visual Styling

### Color Palette (Dark Theme)

| Element | Class |
|---------|-------|
| Expanded content bg | `bg-[#09090b]` |
| File path pill | `bg-white/10 hover:bg-white/20` |
| Action text | `text-gray-400` |
| Content text | `text-gray-300` |
| Icons | `text-gray-500` |
| Borders | `border-white/10` |

### Interactions

- Click anywhere on row to toggle expand/collapse
- Animated with `framer-motion` (height + opacity)
- Chevron rotates 90° when expanded
- Keyboard accessible (Enter/Space to toggle)
- `aria-expanded` and `aria-controls` for accessibility

## Data Transformation

### Tool Name to Action Mapping

```typescript
const TOOL_ACTION_MAP: Record<string, ToolAction> = {
  // File operations
  writeFile: 'Created',
  createFile: 'Created',
  createWebsite: 'Created',
  editFile: 'Edited',

  // Read operations
  readFile: 'Read',
  getProjectStructure: 'Searched',
  analyzeProjectState: 'Searched',

  // Execution
  runCommand: 'Executed',
  startDevServer: 'Executed',
  executeCode: 'Executed',
  installPackage: 'Executed',

  // Generation/validation
  getBuildStatus: 'Generated',
  planChanges: 'Generated',
  markStepComplete: 'Generated',
}
```

### Path Extraction

```typescript
function extractFilePath(toolName: string, input?: Record<string, unknown>): string {
  if (input?.path) return String(input.path)
  if (input?.name) return String(input.name)
  if (input?.command) return String(input.command).slice(0, 50)
  return toolName
}
```

### Content Extraction

```typescript
function extractToolContent(output?: Record<string, unknown> | string): string | undefined {
  if (typeof output === 'string') return output
  if (!output) return undefined

  return output.diff ?? output.content ?? output.result ??
         output.stdout ?? JSON.stringify(output, null, 2)
}
```

## Integration

### Message Flow

```
AssistantMessage
├── ThinkingSection (if thinking detected)
├── For each part:
│   ├── TextPart → ChatMarkdown
│   └── ToolPart → ToolResultItem
```

### Files to Modify

| File | Action |
|------|--------|
| `components/chat/tool-result-item.tsx` | Create new |
| `components/chat/thinking-section.tsx` | Create new |
| `components/chat/message.tsx` | Update imports and rendering |
| `components/chat/tool-call-display.tsx` | Delete or deprecate |

## Dependencies

- `framer-motion` - Already installed
- `lucide-react` - Already installed
- No new dependencies required

## Implementation Notes

1. Keep utility functions (`toRelativePath`) for path display
2. Use custom SVG icons matching Claudable's style for each action type
3. Preserve existing `ChatMarkdown` component for text rendering
4. Ensure thinking time display (`thinkingTime` prop) still works
