"use client";

import dynamic from "next/dynamic";

/**
 * Deferred Vercel Analytics — loaded after hydration to reduce initial JS bundle.
 * Follows Vercel best practice: bundle-defer-third-party.
 */
const Analytics = dynamic(
  () =>
    import("@vercel/analytics/next").then((m) => ({ default: m.Analytics })),
  { ssr: false },
);

export function DeferredAnalytics() {
  return <Analytics />;
}
