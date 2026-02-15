"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-[#111111] text-zinc-100 font-sans antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-4xl font-bold tracking-tight text-red-400">
              Something went wrong
            </h1>
            <p className="text-zinc-400">
              An unexpected error occurred. Please try again.
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
      </body>
    </html>
  );
}
