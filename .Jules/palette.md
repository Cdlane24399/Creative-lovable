## 2024-03-20 - Accessible Chat Input
**Learning:** Adding ARIA labels to icon-only buttons significantly improves screen reader experience without visual clutter.
**Action:** Always check icon-only buttons for aria-labels.

## 2026-01-25 - Toggle Button State
**Learning:** Toggle buttons (like "Visual edits" or "Plan") must use `aria-pressed` to communicate state to screen readers, otherwise they appear as static buttons.
**Action:** Always check toggle buttons for `aria-pressed` attribute matching their active state.
