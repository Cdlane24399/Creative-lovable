## 2024-03-20 - Accessible Chat Input
**Learning:** Adding ARIA labels to icon-only buttons significantly improves screen reader experience without visual clutter.
**Action:** Always check icon-only buttons for aria-labels.

## 2024-03-21 - Toggle Button Accessibility
**Learning:** Toggle buttons that only change visual style (color/icon) are invisible to screen readers without `aria-pressed`.
**Action:** Use `aria-pressed` on all toggle buttons to communicate state programmatically.
