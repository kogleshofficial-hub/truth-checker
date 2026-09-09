"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";

type EvidenceSource = { title: string; url: string; snippet: string };
type Verdict = "Likely true" | "Likely false" | "Misleading" | "Unclear";
type Confidence = "High" | "Medium" | "Low";
type Investigation = { verdict: Verdict; confidence: Confidence; summary: string; reasoning: string[]; context: string; evidenceToCheck: string[] };
type CheckResponse = { success: boolean; claim?: string; investigation?: Investigation; evidence?: EvidenceSource[]; error?: string };

const stages = [
  ["01", "Understand", "Turn the statement into something that can be investigated."],
  ["02", "Find evidence", "Search multiple web sources instead of trusting one result."],
  ["03", "Compare", "Look for support, contradiction, missing context, and source quality."],
  ["04", "Explain", "Return a cautious verdict with reasoning and inspectable sources."],
] as const;

const examples = [
  "Humans only use 10% of their brains.",
  "Lightning never strikes the same place twice.",
  "Goldfish have a three-second memory.",
];

const verdictMeta: Record<Verdict, { icon: string; text: string; border: string; bg: string }> = {
  "Likely true": { icon: "✓", text: "text-emerald-300", border: "border-emerald-400/20", bg: "bg-emerald-400/[0.055]" },
  "Likely false": { icon: "×", text: "text-rose-300", border: "border-rose-400/20", bg: "bg-rose-400/[0.055]" },
  Misleading: { icon: "!", text: "text-amber-300", border: "border-amber-400/20", bg: "bg-amber-400/[0.055]" },
  Unclear: { icon: "?", text: "text-sky-300", border: "border-sky-400/20", bg: "bg-sky-400/[0.055]" },
};

function domainOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export default function Home() {
  const [claim, setClaim] = useState("");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState(0);
  const [copied, setCopied] = useState(false);

  const investigation = result?.investigation;
  const evidence = result?.evidence ?? [];
  const meta = investigation ? verdictMeta[investigation.verdict] : verdictMeta.Unclear;
  const domains = useMemo(() => Array.from(new Set(evidence.map((item) => domainOf(item.url)))), [evidence]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = claim.replace(/\s+/g, " ").trim();
    if (!cleaned) return setError("Enter a claim first.");
    if (cleaned.length < 8) return setError("Give us a little more context so the claim can be investigated properly.");

    setLoading(true); setError(""); setResult(null); setCopied(false); setStage(0);
    const timer = window.setInterval(() => setStage((value) => Math.min(value + 1, stages.length - 1)), 850);
    try {
      const response = await fetch("/api/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim: cleaned }) });
      const type = response.headers.get("content-type") ?? "";
      if (!type.includes("application/json")) throw new Error("The investigation service returned an unexpected response. Please try again.");
      const data = (await response.json()) as CheckResponse;
      if (!response.ok || !data.success) throw new Error(data.error || "The investigation could not be completed.");
      setResult(data); setStage(stages.length - 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The investigation could not be completed.");
    } finally { window.clearInterval(timer); setLoading(false); }
  }

  function example(value: string) { setClaim(value); setError(""); setResult(null); window.setTimeout(() => document.getElementById("claim-box")?.focus(), 40); }
  function reset() { setClaim(""); setResult(null); setError(""); setCopied(false); setStage(0); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function copyResult() {
    if (!investigation) return;
    const text = [
      "TRUTH CHECKER — Evidence before certainty", "", `Claim: ${result?.claim ?? ""}`,
      `Verdict: ${investigation.verdict}`, `Confidence: ${investigation.confidence}`, "", investigation.summary,
      "", "Reasoning:", ...investigation.reasoning.map((item, i) => `${i + 1}. ${item}`),
      "", `Context: ${investigation.context}`, "", "Sources:", ...evidence.map((item) => `${item.title} — ${item.url}`),
    ].join("\n");
    try { await navigator.clipboard.writeText(text); setCopied(true); }
    catch { setError("Your browser blocked clipboard access. You can still copy the result manually."); }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050608] text-white selection:bg-white selection:text-black">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <div className="absolute left-1/2 top-[-320px] h-[720px] w-[1000px] -translate-x-1/2 rounded-full bg-white/[0.028] blur-3xl" />
        <div className="absolute left-[-240px] top-[42%] h-[520px] w-[520px] rounded-full bg-sky-500/[0.025] blur-3xl" />
        <div className="absolute bottom-[-220px] right-[-120px] h-[520px] w-[520px] rounded-full bg-violet-500/[0.025] blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-5 py-6 md:px-8 md:py-8">
        <header className="flex items-center justify-between border-b border-white/[0.07] pb-6">
          <button type="button" onClick={reset} className="group flex items-center gap-3 text-left" aria-label="Return to Truth Checker home">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.04] transition-transform group-hover:scale-105">
              <Image src="/icon.svg" alt="Truth Checker" width={40} height={40} className="h-full w-full object-contain p-1" priority />
            </div>
            <div><div className="text-[15px] font-bold tracking-tight">Truth Checker</div><div className="text-xs text-zinc-500">Evidence before certainty.</div></div>
          </button>
          <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-xs text-zinc-400 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />Evidence-first AI</div>
        </header>

        <section className="mx-auto max-w-4xl pt-16 text-center md:pt-24">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-xs font-medium text-zinc-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Investigate before you believe</div>
          <h1 className="text-5xl font-black tracking-[-0.055em] md:text-7xl lg:text-[82px] lg:leading-[0.96]">Don&apos;t just believe it.<br /><span className="bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">Check it.</span></h1>
          <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-zinc-400 md:text-lg">Enter a claim. Truth Checker searches available web evidence, compares what it finds, and explains a cautious verdict you can inspect.</p>

          <form onSubmit={submit} className="mx-auto mt-10 max-w-3xl" aria-label="Investigate a claim">
            <div className="group rounded-[26px] border border-white/[0.10] bg-white/[0.035] p-2 shadow-2xl shadow-black/40 backdrop-blur-xl transition focus-within:border-white/[0.18] focus-within:bg-white/[0.045]">
              <label htmlFor="claim-box" className="sr-only">Claim to investigate</label>
              <textarea id="claim-box" value={claim} onChange={(event) => { setClaim(event.target.value); if (error) setError(""); }} placeholder={'Try: “Humans only use 10% of their brains.”'} maxLength={500} rows={4} disabled={loading} className="w-full resize-none rounded-[20px] bg-transparent px-5 py-5 text-[15px] leading-7 text-white outline-none placeholder:text-zinc-600 disabled:opacity-60" />
              <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-2 pt-2"><span className="px-3 text-xs tabular-nums text-zinc-600">{claim.length}/500</span><button type="submit" disabled={loading} className="rounded-[17px] bg-white px-6 py-3.5 text-sm font-bold text-black transition hover:-translate-y-0.5 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50">{loading ? "Investigating…" : "Check claim →"}</button></div>
            </div>
          </form>

          {!loading && !result && <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2"><span className="mr-1 text-xs text-zinc-600">Try an example:</span>{examples.map((item) => <button key={item} type="button" onClick={() => example(item)} className="rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-500 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-zinc-300">{item}</button>)}</div>}

          {loading && <section className="mx-auto mt-8 max-w-3xl rounded-3xl border border-white/[0.08] bg-white/[0.025] p-5 text-left" aria-live="polite" aria-busy="true"><div className="mb-5 flex items-center justify-between"><div><p className="text-sm font-semibold text-zinc-200">Building an evidence trail</p><p className="mt-1 text-xs text-zinc-500">Sources first. Verdict second.</p></div><div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" /></div><div className="grid gap-2 sm:grid-cols-4">{stages.map(([number, title], index) => <div key={number} className={`rounded-2xl border p-3 transition ${index <= stage ? "border-white/[0.14] bg-white/[0.055]" : "border-white/[0.05] bg-white/[0.015]"}`}><div className="text-[10px] font-bold tracking-[0.18em] text-zinc-600">{number}</div><div className={`mt-2 text-xs font-semibold ${index <= stage ? "text-zinc-200" : "text-zinc-600"}`}>{title}</div></div>)}</div></section>}

          {error && <div role="alert" className="mx-auto mt-5 max-w-3xl rounded-2xl border border-red-400/20 bg-red-400/[0.05] px-5 py-4 text-left text-sm leading-6 text-red-300"><div className="flex gap-3"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-red-400/30 text-[10px] font-bold">!</span><span>{error}</span></div></div>}
        </section>

        {result?.success && investigation && <section className="mx-auto mt-12 max-w-5xl" aria-live="polite">
          <div className={`rounded-[30px] border ${meta.border} ${meta.bg} p-5 shadow-2xl shadow-black/20 md:p-7`}>
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0"><div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500"><span className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1">INVESTIGATION RESULT</span><span>{evidence.length} sources</span>{domains.length > 0 && <span>· {domains.length} domains</span>}</div><h2 className="max-w-3xl text-3xl font-black tracking-tight md:text-4xl">{investigation.verdict}</h2><p className="mt-3 max-w-3xl text-base leading-7 text-zinc-300">{investigation.summary}</p></div>
              <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3"><span className={`flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.10] text-sm font-bold ${meta.text}`}>{meta.icon}</span><div><div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">Confidence</div><div className="mt-0.5 text-sm font-semibold text-zinc-200">{investigation.confidence}</div></div></div>
            </div>

            <div className="mt-7 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-5"><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">Why</div><div className="mt-4 space-y-3">{investigation.reasoning.map((item, i) => <div key={`${item}-${i}`} className="flex gap-3 text-sm leading-6 text-zinc-300"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />{item}</div>)}</div></div>
              <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-5"><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">Context</div><p className="mt-4 text-sm leading-6 text-zinc-300">{investigation.context}</p></div>
            </div>

            <div className="mt-3 rounded-2xl border border-white/[0.07] bg-black/20 p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">Evidence trail</div><p className="mt-1 text-xs text-zinc-500">Sources stay visible so a person can inspect the evidence.</p></div><span className="text-xs text-zinc-600">{evidence.length} retrieved</span></div><div className="mt-4 grid gap-2 md:grid-cols-2">{evidence.map((source, i) => <a key={`${source.url}-${i}`} href={source.url} target="_blank" rel="noreferrer" className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 transition hover:border-white/[0.13] hover:bg-white/[0.04]"><div className="flex items-start justify-between gap-3"><span className="text-[10px] font-bold tracking-[0.15em] text-zinc-700">SOURCE {String(i + 1).padStart(2, "0")}</span><span className="text-zinc-600 group-hover:text-zinc-300">↗</span></div><div className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-zinc-200">{source.title}</div><div className="mt-2 truncate text-xs text-zinc-600">{domainOf(source.url)}</div><p className="mt-3 line-clamp-3 text-xs leading-5 text-zinc-500">{source.snippet}</p></a>)}</div>{evidence.length === 0 && <p className="mt-4 text-sm text-zinc-500">No usable sources were returned, so no factual conclusion should be trusted.</p>}</div>

            <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-zinc-600">Investigation aid, not a guarantee of truth. Important claims should be checked against primary and authoritative sources.</p><div className="flex shrink-0 gap-2"><button type="button" onClick={copyResult} className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.07]">{copied ? "Copied ✓" : "Copy result"}</button><button type="button" onClick={reset} className="rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-black hover:bg-zinc-200">New check</button></div></div>
          </div>
        </section>}

        {!result && !loading && <>
          <section className="mx-auto mt-20 max-w-5xl"><div className="mb-5 flex items-end justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-600">The method</p><h2 className="mt-2 text-2xl font-bold tracking-tight">Evidence first. Explanation second.</h2></div><p className="hidden max-w-sm text-right text-xs leading-5 text-zinc-600 md:block">A confident answer is not the same thing as verified evidence.</p></div><div className="grid gap-3 md:grid-cols-4">{stages.map(([number, title, text]) => <article key={number} className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-5 transition hover:-translate-y-1 hover:border-white/[0.12] hover:bg-white/[0.035]"><span className="text-[10px] font-bold tracking-[0.2em] text-zinc-700">{number}</span><h3 className="mt-8 font-semibold text-zinc-200">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-500">{text}</p></article>)}</div></section>
          <section className="mx-auto mt-16 max-w-5xl"><div className="grid gap-3 md:grid-cols-3"><article className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6 md:col-span-2"><p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-600">Why it exists</p><h2 className="mt-3 text-2xl font-bold tracking-tight">AI can sound certain when the evidence is weak.</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-500">Truth Checker was built around a simple idea: retrieve evidence first, treat that evidence as untrusted data, then make the reasoning visible enough for a person to inspect.</p></article><article className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6"><p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-600">Cautious by design</p><div className="mt-4 space-y-3 text-sm text-zinc-400"><div>✓ Four verdicts instead of fake binary certainty</div><div>✓ Confidence separated from verdict</div><div>✓ Multiple sources with concentration limits</div><div>✓ Retrieved content treated as untrusted data</div></div></article></div></section>
        </>}

        <footer className="mx-auto mt-20 max-w-5xl border-t border-white/[0.07] py-8"><div className="flex flex-col gap-3 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between"><div>Truth Checker · Built by Koglesh R. Murugan</div><div>Investigate before you believe.</div></div></footer>
      </div>
    </main>
  );
}
