## 2024-03-20 - Accessible Chat Input
**Learning:** Adding ARIA labels to icon-only buttons significantly improves screen reader experience without visual clutter.
**Action:** Always check icon-only buttons for aria-labels.

## 2025-05-15 - Toggle Button Accessibility
**Learning:** Custom toggle buttons (using div/button) need `aria-pressed` to communicate state to screen readers, as visual color changes are insufficient.
**Action:** Audit all custom toggle components for `aria-pressed` attributes.
