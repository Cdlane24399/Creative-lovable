## 2024-03-20 - Accessible Chat Input
**Learning:** Adding ARIA labels to icon-only buttons significantly improves screen reader experience without visual clutter.
**Action:** Always check icon-only buttons for aria-labels.

## 2024-05-22 - Global Tooltip Provider
**Learning:** Shadcn/Radix tooltips require a global `TooltipProvider`. Adding it to `theme-provider.tsx` ensures all tooltip components work instantly without wrapping each one individually.
**Action:** Verify `TooltipProvider` presence when adding tooltips.
