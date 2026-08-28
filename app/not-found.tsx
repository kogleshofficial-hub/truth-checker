import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#050608] text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-5 py-10">
        <section className="w-full rounded-[28px] border border-white/[0.08] bg-white/[0.025] p-8 text-center shadow-2xl shadow-black/30 backdrop-blur-xl md:p-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">
            404 · Page not found
          </p>

          <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
            That page doesn&apos;t exist.
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-zinc-500">
            The address may be incorrect, or the page may have moved. Return
            to Truth Checker and start a new investigation.
          </p>

          <Link
            href="/"
            className="mt-7 inline-flex rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition hover:-translate-y-0.5 hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-3"
          >
            Back to Truth Checker
          </Link>
        </section>
      </div>
    </main>
  );
}
