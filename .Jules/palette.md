## 2024-03-20 - Accessible Chat Input
**Learning:** Adding ARIA labels to icon-only buttons significantly improves screen reader experience without visual clutter.
**Action:** Always check icon-only buttons for aria-labels.

## 2026-02-06 - Framer Motion & Tooltips
**Learning:** Wrapping `motion.button` in `TooltipTrigger` inside `AnimatePresence` breaks exit animations because the direct child changes.
**Action:** For animated toggle states, stick to `aria-label` and `title` if wrapping breaks the animation, or restructure the component to keep the Tooltip outside the AnimatePresence.
