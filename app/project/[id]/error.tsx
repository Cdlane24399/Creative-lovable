"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Project error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 bg-[#111111]">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">
          Failed to load project
        </h2>
        <p className="text-zinc-400 text-sm">
          There was a problem loading this project. It may have been deleted or
          you may not have access.
        </p>
        {error.digest && (
          <p className="text-xs text-zinc-600 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-800 px-5 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
          >
            Retry
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-800 px-5 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
