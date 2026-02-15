import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4 bg-[#111111]">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-6xl font-bold tracking-tight text-zinc-100">404</h1>
        <h2 className="text-xl font-semibold text-zinc-300">Page not found</h2>
        <p className="text-zinc-400 text-sm">
          The page you are looking for does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-zinc-800 px-6 py-2.5 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
