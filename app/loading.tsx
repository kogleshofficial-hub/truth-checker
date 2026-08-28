export default function Loading() {
  return (
    <main
      className="min-h-screen bg-[#050608] text-white"
      aria-busy="true"
      aria-label="Loading Truth Checker"
    >
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-5 py-10 md:px-8">
        <div className="w-full max-w-2xl rounded-[28px] border border-white/[0.08] bg-white/[0.025] p-8 shadow-2xl shadow-black/30 backdrop-blur-xl md:p-10">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-400" />
            <p className="text-sm font-semibold">Loading Truth Checker</p>
          </div>

          <div className="mt-8 space-y-3" aria-hidden="true">
            <div className="h-4 w-2/5 animate-pulse rounded-full bg-white/[0.07]" />
            <div className="h-3 w-full animate-pulse rounded-full bg-white/[0.05]" />
            <div className="h-3 w-5/6 animate-pulse rounded-full bg-white/[0.05]" />
            <div className="mt-7 h-28 animate-pulse rounded-2xl bg-white/[0.035]" />
          </div>

          <p className="mt-6 text-xs text-zinc-600">
            Preparing the investigation workspace…
          </p>
        </div>
      </div>
    </main>
  );
}
