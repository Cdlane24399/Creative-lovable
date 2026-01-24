## 2024-03-20 - Accessible Chat Input
**Learning:** Adding ARIA labels to icon-only buttons significantly improves screen reader experience without visual clutter.
**Action:** Always check icon-only buttons for aria-labels.

## 2024-05-22 - Code Block Actions
**Learning:** `react-markdown`'s `pre` component is the ideal place to intercept code blocks for adding utility buttons like "Copy", as it wraps the entire code area.
**Action:** Use a wrapper component for `pre` to add contextual actions to code snippets.
