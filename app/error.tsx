"use client"

import { useEffect } from "react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("App error boundary caught:", error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 bg-[#111111]">
      <div className="max-w-md text-center space-y-4">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">
          Something went wrong
        </h2>
        <p className="text-zinc-400 text-sm">
          An error occurred while loading this page.
        </p>
        {error.digest && (
          <p className="text-xs text-zinc-600 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center justify-center rounded-lg bg-zinc-800 px-6 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
