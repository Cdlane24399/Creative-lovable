export default function ProjectLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090B]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300" />
        <p className="text-sm text-zinc-500">Loading project...</p>
      </div>
    </div>
  )
}
