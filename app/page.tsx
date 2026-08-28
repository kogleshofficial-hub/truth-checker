"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type EvidenceSource = { title: string; url: string; snippet: string };
type Verdict = "Likely true" | "Likely false" | "Misleading" | "Unclear";
type Confidence = "High" | "Medium" | "Low";
type Investigation = {
  verdict: Verdict;
  confidence: Confidence;
  summary: string;
  reasoning: string[];
  context: string;
  evidenceToCheck: string[];
};
type CheckResponse = {
  success: boolean;
  claim?: string;
  investigation?: Investigation;
  evidence?: EvidenceSource[];
  error?: string;
};

const stages = [
  ["Understanding the claim", "Breaking the statement into something testable."],
  ["Searching the evidence", "Looking for relevant information from available web sources."],
  ["Comparing findings", "Comparing the available evidence against the claim."],
  ["Building the verdict", "Turning the findings into a clear explanation."],
] as const;

const examples = [
  "Humans only use 10% of their brains.",
  "Lightning never strikes the same place twice.",
  "Goldfish have a three-second memory.",
];

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function verdictTone(verdict: Verdict) {
  if (verdict === "Likely true") return "text-emerald-400";
  if (verdict === "Likely false") return "text-red-400";
  if (verdict === "Misleading") return "text-amber-400";
  return "text-sky-400";
}

function verdictPanel(verdict: Verdict) {
  if (verdict === "Likely true") return "border-emerald-400/20 bg-emerald-400/[0.045]";
  if (verdict === "Likely false") return "border-red-400/20 bg-red-400/[0.045]";
  if (verdict === "Misleading") return "border-amber-400/20 bg-amber-400/[0.045]";
  return "border-sky-400/20 bg-sky-400/[0.045]";
}

function confidenceTone(confidence: Confidence) {
  if (confidence === "High") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (confidence === "Medium") return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  return "border-sky-400/20 bg-sky-400/10 text-sky-300";
}

export default function Home() {
  const [claim, setClaim] = useState("");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState(0);
  const [copied, setCopied] = useState(false);

  const investigation = result?.investigation;
  const sources = result?.evidence ?? [];
  const verdict = investigation?.verdict ?? "Unclear";

  const verdictDescription = useMemo(() => {
    switch (verdict) {
      case "Likely true": return "The available evidence generally supports this claim.";
      case "Likely false": return "The available evidence generally contradicts this claim.";
      case "Misleading": return "The claim contains an element of truth but lacks important context.";
      default: return "There is not enough reliable evidence to reach a strong conclusion.";
    }
  }, [verdict]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function investigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = claim.trim();

    if (!cleaned) return setError("Enter a claim first.");
    if (cleaned.length < 8) return setError("Give us a little more information so the claim can be investigated properly.");
    if (cleaned.length > 500) return setError("Keep the claim to 500 characters or fewer.");

    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);
    setStage(0);

    const timer = window.setInterval(() => {
      setStage((current) => Math.min(current + 1, stages.length - 1));
    }, 900);

    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim: cleaned }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("The server returned an unexpected response. Make sure the API route is running.");
      }

      const data = (await response.json()) as CheckResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error || "The investigation could not be completed.");
      }

      setResult(data);
      setStage(stages.length - 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The investigation could not be completed.");
    } finally {
      window.clearInterval(timer);
      setLoading(false);
    }
  }

  function reset() {
    setClaim("");
    setResult(null);
    setError("");
    setCopied(false);
    setStage(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectExample(example: string) {
    setClaim(example);
    setError("");
    setResult(null);
    window.setTimeout(() => document.getElementById("claim-box")?.focus(), 50);
  }

  async function copyResult() {
    if (!investigation) return;
    const text = [
      "TRUTH CHECKER",
      "",
      `Claim: ${result?.claim ?? claim}`,
      `Verdict: ${investigation.verdict}`,
      `Confidence: ${investigation.confidence}`,
      "",
      investigation.summary,
      "",
      "Reasoning:",
      ...investigation.reasoning.map((item, index) => `${index + 1}. ${item}`),
      "",
      `Context: ${investigation.context}`,
      "",
      "Sources:",
      ...sources.map((source, index) => `${index + 1}. ${source.title} — ${source.url}`),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("Could not copy the result. Your browser may have blocked clipboard access.");
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050608] text-white selection:bg-white selection:text-black">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-[-280px] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-white/[0.025] blur-3xl" />
        <div className="absolute left-[-180px] top-[35%] h-[420px] w-[420px] rounded-full bg-sky-500/[0.025] blur-3xl" />
        <div className="absolute bottom-[-180px] right-[-100px] h-[420px] w-[420px] rounded-full bg-violet-500/[0.02] blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-5 py-7 md:px-8 md:py-9">
        <header className="flex items-center justify-between border-b border-white/[0.06] pb-7">
          <button type="button" onClick={reset} className="group flex items-center gap-3 text-left" aria-label="Return to Truth Checker home">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-black text-black shadow-lg shadow-white/[0.05] transition group-hover:scale-105">T</span>
            <span>
              <span className="block text-lg font-bold tracking-tight">Truth Checker</span>
              <span className="block text-xs text-zinc-500">Evidence before certainty.</span>
            </span>
          </button>
          <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-xs text-zinc-400 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
            AI + Web Evidence
          </div>
        </header>

        <section className="mx-auto max-w-4xl pt-20 text-center md:pt-28">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-xs font-medium text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Investigate before you believe
          </div>
          <h1 className="text-5xl font-black tracking-[-0.055em] md:text-7xl lg:text-[80px] lg:leading-[0.98]">
            Don&apos;t just believe it.
            <br />
            <span className="bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">Check it.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-zinc-400 md:text-lg">
            Enter a claim and Truth Checker investigates it using available web evidence and AI analysis — then turns the findings into a clear, understandable verdict.
          </p>

          <form onSubmit={investigate} className="mx-auto mt-11 max-w-3xl">
            <div className="rounded-[26px] border border-white/[0.10] bg-white/[0.035] p-2 shadow-2xl shadow-black/40 backdrop-blur-xl transition focus-within:border-white/[0.18] focus-within:bg-white/[0.045]">
              <textarea
                id="claim-box"
                value={claim}
                onChange={(event) => { setClaim(event.target.value); if (error) setError(""); }}
                placeholder='Try: "Humans only use 10% of their brains."'
                maxLength={500}
                rows={4}
                disabled={loading}
                aria-label="Claim to investigate"
                className="w-full resize-none rounded-[20px] bg-transparent px-5 py-5 text-[15px] leading-7 text-white outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-2 pt-2">
                <span className="px-3 text-xs tabular-nums text-zinc-600" aria-live="polite">{claim.length}/500</span>
                <button type="submit" disabled={loading} className="rounded-[17px] bg-white px-6 py-3.5 text-sm font-bold text-black shadow-xl transition hover:-translate-y-0.5 hover:bg-zinc-200 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50">
                  {loading ? "Investigating..." : "Check claim →"}
                </button>
              </div>
            </div>
          </form>

          {!loading && !result && (
            <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2">
              <span className="mr-1 text-xs text-zinc-600">Try an example:</span>
              {examples.map((example) => (
                <button key={example} type="button" onClick={() => selectExample(example)} className="rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-500 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-zinc-300">
                  {example}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div role="alert" className="mx-auto mt-5 max-w-3xl rounded-2xl border border-red-400/20 bg-red-400/[0.05] px-5 py-4 text-left text-sm leading-6 text-red-300">
              <div className="flex gap-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-red-400/30 text-[10px] font-bold">!</span><span>{error}</span></div>
            </div>
          )}
        </section>

        {!loading && !result && (
          <section className="mx-auto mt-20 max-w-5xl" aria-label="How Truth Checker works">
            <div className="grid gap-3 md:grid-cols-3">
              {["Submit a claim", "Compare evidence", "Understand the result"].map((title, index) => (
                <div key={title} className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6 transition hover:-translate-y-1 hover:border-white/[0.12] hover:bg-white/[0.035]">
                  <span className="text-xs font-bold tracking-[0.2em] text-zinc-700">0{index + 1}</span>
                  <h2 className="mt-7 font-semibold text-zinc-200">{title}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">{[
                    "Give Truth Checker a statement you want to investigate.",
                    "Relevant sources are gathered and the available findings are analyzed.",
                    "Get a verdict, confidence level, reasoning, context, and sources.",
                  ][index]}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {loading && (
          <section className="mx-auto mt-16 max-w-4xl" aria-live="polite" aria-busy="true">
            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.025] p-7 shadow-2xl shadow-black/30 backdrop-blur-xl md:p-9">
              <div className="mb-7 flex items-start justify-between gap-6">
                <div><div className="flex items-center gap-3"><span className="h-3 w-3 animate-pulse rounded-full bg-emerald-400" /><p className="font-semibold">Investigating your claim</p></div><p className="mt-2 text-sm leading-6 text-zinc-500">{stages[stage][1]}</p></div>
                <span className="shrink-0 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-xs tabular-nums text-zinc-500">{stage + 1}/{stages.length}</span>
              </div>
              <div className="mb-8 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${((stage + 1) / stages.length) * 100}%` }} /></div>
              <div className="space-y-1">
                {stages.map(([title, description], index) => {
                  const active = index === stage;
                  const complete = index < stage;
                  return <div key={title} className={`flex gap-4 rounded-2xl px-4 py-4 transition-all duration-500 md:px-5 ${active ? "bg-white/[0.045]" : complete ? "opacity-80" : "opacity-45"}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${complete ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : active ? "border-white/20 bg-white text-black" : "border-white/[0.08] bg-white/[0.02] text-zinc-600"}`}>{complete ? "✓" : index + 1}</span>
                    <div><p className={`text-sm font-semibold ${active ? "text-white" : "text-zinc-500"}`}>{title}</p><p className={`mt-1 text-sm leading-6 ${active ? "text-zinc-400" : "text-zinc-600"}`}>{description}</p></div>
                  </div>;
                })}
              </div>
              <div className="mt-7 rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3 text-center text-xs text-zinc-600">Evidence is being analyzed. This may take a moment.</div>
            </div>
          </section>
        )}

        {investigation && (
          <section className="mx-auto mt-16 max-w-5xl space-y-5">
            <div className={`rounded-[28px] border p-7 shadow-2xl shadow-black/25 md:p-9 ${verdictPanel(investigation.verdict)}`}>
              <div className="flex flex-col justify-between gap-7 md:flex-row md:items-start">
                <div className="max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Investigation result</p>
                  <h2 className={`mt-4 text-4xl font-black tracking-tight md:text-5xl ${verdictTone(investigation.verdict)}`}>{investigation.verdict}</h2>
                  <p className="mt-3 text-sm text-zinc-500">{verdictDescription}</p>
                  <p className="mt-5 text-base leading-7 text-zinc-300">{investigation.summary}</p>
                </div>
                <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
                  <span className={`rounded-full border px-4 py-2 text-xs font-semibold ${confidenceTone(investigation.confidence)}`}>{investigation.confidence} confidence</span>
                  <button type="button" onClick={copyResult} className="rounded-full border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white">{copied ? "✓ Copied result" : "Copy result"}</button>
                </div>
              </div>
              <div className="mt-8 rounded-2xl border border-white/[0.06] bg-black/20 p-5"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">Claim investigated</p><p className="mt-2 text-sm leading-7 text-zinc-300">{result?.claim}</p></div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-7 shadow-xl shadow-black/20 md:p-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">Why</p><h2 className="mt-2 text-xl font-bold">Reasoning</h2>
                <div className="mt-7 space-y-5">{investigation.reasoning.map((item, index) => <div key={`${item}-${index}`} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025] text-[10px] font-bold text-zinc-500">{String(index + 1).padStart(2, "0")}</span><p className="text-sm leading-7 text-zinc-400">{item}</p></div>)}</div>
              </div>
              <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-7 shadow-xl shadow-black/20 md:p-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">Context</p><h2 className="mt-2 text-xl font-bold">Important nuance</h2>
                <div className="mt-7 rounded-2xl border border-white/[0.06] bg-black/20 p-5"><p className="text-sm leading-7 text-zinc-400">{investigation.context}</p></div>
                <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-[10px] uppercase tracking-wider text-zinc-600">Confidence</p><p className="mt-2 text-sm font-semibold text-zinc-300">{investigation.confidence}</p></div><div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"><p className="text-[10px] uppercase tracking-wider text-zinc-600">Sources</p><p className="mt-2 text-sm font-semibold text-zinc-300">{sources.length}</p></div></div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-7 shadow-xl shadow-black/20 md:p-8">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">Web evidence</p><h2 className="mt-2 text-2xl font-bold">Sources checked</h2><p className="mt-2 text-sm text-zinc-500">Review the underlying sources yourself before making an important decision.</p></div><span className="w-fit rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-600">{sources.length} sources</span></div>
              <div className="mt-7 grid gap-3">{sources.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noopener noreferrer" className="group rounded-2xl border border-white/[0.06] bg-black/20 p-5 transition hover:-translate-y-0.5 hover:border-white/[0.13] hover:bg-white/[0.035]"><div className="flex gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025] text-xs font-bold text-zinc-500 transition group-hover:bg-white group-hover:text-black">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><h3 className="font-semibold leading-6 text-zinc-200 group-hover:text-white">{source.title}</h3><span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-zinc-700">{domainOf(source.url)}</span></div><p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-500">{source.snippet}</p><p className="mt-4 truncate text-xs text-zinc-700">{source.url} ↗</p></div></div></a>)}{sources.length === 0 && <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-6 text-sm text-zinc-500">No web sources were returned for this investigation.</div>}</div>
            </div>

            <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-7 shadow-xl shadow-black/20 md:p-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">Verification</p><h2 className="mt-2 text-xl font-bold">Evidence worth checking</h2><p className="mt-2 text-sm text-zinc-500">These are the areas that matter most when independently verifying the conclusion.</p>
              <div className="mt-7 grid gap-3 md:grid-cols-2">{investigation.evidenceToCheck.map((item, index) => <div key={`${item}-${index}`} className="flex gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-[9px] font-bold text-zinc-600">{String(index + 1).padStart(2, "0")}</span><p className="text-sm leading-6 text-zinc-400">{item}</p></div>)}</div>
            </div>

            <div className="flex flex-col items-center justify-center gap-4 py-8 text-center"><p className="text-sm text-zinc-600">Ready to investigate something else?</p><button type="button" onClick={reset} className="rounded-full border border-white/[0.10] bg-white/[0.035] px-6 py-3 text-sm font-semibold text-zinc-300 shadow-xl transition hover:-translate-y-0.5 hover:bg-white hover:text-black">Investigate another claim →</button></div>
          </section>
        )}

        <footer className="mt-24 border-t border-white/[0.06] py-9 text-center"><p className="text-xs leading-6 text-zinc-600">Truth Checker analyzes available evidence — it does not replace primary sources, expert advice, or professional judgment.</p><p className="mt-4 text-xs font-medium tracking-wide text-zinc-700">Created by Koglesh R. Murugan</p></footer>
      </div>
    </main>
  );
}
