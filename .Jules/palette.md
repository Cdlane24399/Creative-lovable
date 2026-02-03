## 2024-03-20 - Accessible Chat Input
**Learning:** Adding ARIA labels to icon-only buttons significantly improves screen reader experience without visual clutter.
**Action:** Always check icon-only buttons for aria-labels.

## 2026-02-03 - ARIA Label Overrides Text
**Learning:** Adding `aria-label` to buttons with dynamic text (like project names) replaces the text content for screen readers, hiding the actual value.
**Action:** Only use `aria-label` on icon-only buttons or when the visible text is insufficient.
