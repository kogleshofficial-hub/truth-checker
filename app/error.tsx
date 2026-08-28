"use client";

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("TRUTH_CHECKER_PAGE_ERROR", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#050608] text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-5 py-10">
        <section className="w-full rounded-[28px] border border-white/[0.08] bg-white/[0.025] p-8 text-center shadow-2xl shadow-black/30 backdrop-blur-xl md:p-10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/[0.06] text-sm font-bold text-red-300">
            !
          </div>

          <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">
            Something went wrong
          </p>

          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">
            The investigation workspace hit an unexpected error.
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-zinc-500">
            Your claim was not changed or submitted again. You can safely try
            loading the workspace once more.
          </p>

          <button
            type="button"
            onClick={() => reset()}
            className="mt-7 rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition hover:-translate-y-0.5 hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-3"
          >
            Try again
          </button>

          {error.digest && (
            <p className="mt-5 text-[11px] text-zinc-700">
              Reference: {error.digest}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
