## 2024-03-20 - Accessible Chat Input
**Learning:** Adding ARIA labels to icon-only buttons significantly improves screen reader experience without visual clutter.
**Action:** Always check icon-only buttons for aria-labels.

## 2024-03-21 - Responsive Button Accessibility
**Learning:** Buttons that hide text responsively (e.g., `hidden sm:inline`) become icon-only on mobile devices, leaving screen reader users without context.
**Action:** Ensure buttons with responsive text visibility have a permanent `aria-label`.
