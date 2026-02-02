## 2024-03-20 - Accessible Chat Input
**Learning:** Adding ARIA labels to icon-only buttons significantly improves screen reader experience without visual clutter.
**Action:** Always check icon-only buttons for aria-labels.

## 2024-05-22 - Editor Header Accessibility
**Learning:** The editor header relies heavily on `title` attributes for tooltips, but lacks `aria-label` for icon-only buttons, making navigation difficult for screen readers.
**Action:** When using custom icon buttons, ensure `aria-label` is present alongside `title`.
