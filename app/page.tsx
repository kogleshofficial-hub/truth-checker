"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";

type EvidenceSource = {
  title: string;
  url: string;
  snippet: string;
};

type Investigation = {
  verdict: "Likely true" | "Likely false" | "Misleading" | "Unclear";
  confidence: "High" | "Medium" | "Low";
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

const investigationStages = [
  {
    title: "Understanding the claim",
    description:
      "Breaking the statement into something that can actually be tested.",
  },
  {
    title: "Searching the evidence",
    description:
      "Looking for relevant information from available web sources.",
  },
  {
    title: "Comparing findings",
    description: "Comparing the evidence against the claim.",
  },
  {
    title: "Building the verdict",
    description: "Turning the findings into a clear explanation.",
  },
];

const exampleClaims = [
  "Humans only use 10% of their brains.",
  "Lightning never strikes the same place twice.",
  "Goldfish have a three-second memory.",
];

export default function Home() {
  const [claim, setClaim] = useState("");
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeStage, setActiveStage] = useState(0);
  const [copied, setCopied] = useState(false);

  const evidenceCount = result?.evidence?.length ?? 0;
  const reasoningCount = result?.investigation?.reasoning?.length ?? 0;

  const verdictLabel = result?.investigation?.verdict ?? "";
  const confidenceLabel = result?.investigation?.confidence ?? "";

  const verdictDescription = useMemo(() => {
    switch (verdictLabel) {
      case "Likely true":
        return "The available evidence generally supports this claim.";

      case "Likely false":
        return "The available evidence generally contradicts this claim.";

      case "Misleading":
        return "The claim contains an element of truth but lacks important context.";

      default:
        return "There is not enough reliable evidence to reach a strong conclusion.";
    }
  }, [verdictLabel]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopied(false);
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanedClaim = claim.trim();

    if (!cleanedClaim) {
      setError("Enter a claim first.");
      return;
    }

    if (cleanedClaim.length < 8) {
      setError(
        "Give us a little more information so the claim can be investigated properly."
      );
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);
    setActiveStage(0);

    const stageTimer = window.setInterval(() => {
      setActiveStage((current) =>
        current < investigationStages.length - 1
          ? current + 1
          : current
      );
    }, 900);

    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          claim: cleanedClaim,
        }),
      });

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("application/json")) {
        throw new Error(
          "The server returned an unexpected response. Make sure the API route is running."
        );
      }

      const data: CheckResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "The investigation could not be completed."
        );
      }

      setResult(data);
      setActiveStage(investigationStages.length - 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The investigation could not be completed."
      );
    } finally {
      window.clearInterval(stageTimer);
      setLoading(false);
    }
  }

  function handleExample(example: string) {
    setClaim(example);
    setError("");
    setResult(null);

    window.setTimeout(() => {
      document.getElementById("claim-box")?.focus();
    }, 50);
  }

  function resetInvestigation() {
    setResult(null);
    setClaim("");
    setError("");
    setCopied(false);
    setActiveStage(0);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function copyResult() {
    if (!result?.investigation) {
      return;
    }

    const text = [
      "TRUTH CHECKER",
      "",
      `Claim: ${result.claim || ""}`,
      `Verdict: ${result.investigation.verdict}`,
      `Confidence: ${result.investigation.confidence}`,
      "",
      result.investigation.summary,
      "",
      "Reasoning:",
      ...result.investigation.reasoning.map(
        (item, index) => `${index + 1}. ${item}`
      ),
      "",
      `Context: ${result.investigation.context}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError(
        "Could not copy the result. Your browser may have blocked clipboard access."
      );
    }
  }

  function verdictColor(verdict?: Investigation["verdict"]) {
    switch (verdict) {
      case "Likely true":
        return "text-emerald-400";

      case "Likely false":
        return "text-red-400";

      case "Misleading":
        return "text-amber-400";

      default:
        return "text-sky-400";
    }
  }

  function verdictBackground(verdict?: Investigation["verdict"]) {
    switch (verdict) {
      case "Likely true":
        return "border-emerald-400/20 bg-emerald-400/[0.045]";

      case "Likely false":
        return "border-red-400/20 bg-red-400/[0.045]";

      case "Misleading":
        return "border-amber-400/20 bg-amber-400/[0.045]";

      default:
        return "border-sky-400/20 bg-sky-400/[0.045]";
    }
  }

  function confidenceColor(
    confidence?: Investigation["confidence"]
  ) {
    switch (confidence) {
      case "High":
        return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";

      case "Medium":
        return "border-amber-400/20 bg-amber-400/10 text-amber-300";

      default:
        return "border-sky-400/20 bg-sky-400/10 text-sky-300";
    }
  }

  function getDomain(url: string) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "source";
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050608] text-white selection:bg-white selection:text-black">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-280px] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-white/[0.025] blur-3xl" />
        <div className="absolute left-[-180px] top-[35%] h-[420px] w-[420px] rounded-full bg-sky-500/[0.025] blur-3xl" />
        <div className="absolute bottom-[-180px] right-[-100px] h-[420px] w-[420px] rounded-full bg-violet-500/[0.02] blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-5 py-7 md:px-8 md:py-9">
        <header className="flex items-center justify-between border-b border-white/[0.06] pb-7">
          <button
            type="button"
            onClick={resetInvestigation}
            className="group flex items-center gap-3 text-left"
            aria-label="Return to Truth Checker home"
          >
            <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.04] shadow-lg shadow-black/20 transition-transform duration-300 group-hover:scale-105">
              <Image
                src="/icon.svg"
                alt="Truth Checker"
                width={40}
                height={40}
                className="h-full w-full object-contain p-1"
                priority
              />
            </div>

            <div>
              <h1 className="text-lg font-bold tracking-tight">
                Truth Checker
              </h1>

              <p className="text-xs text-zinc-500">
                Evidence before certainty.
              </p>
            </div>
          </button>

          <div className="hidden items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-xs text-zinc-400 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]" />
            AI + Web Evidence
          </div>
        </header>

        <section className="mx-auto max-w-4xl pt-20 text-center md:pt-28">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-xs font-medium text-zinc-400 shadow-2xl shadow-black/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Investigate before you believe
          </div>

          <h2 className="text-5xl font-black tracking-[-0.055em] md:text-7xl lg:text-[80px] lg:leading-[0.98]">
            Don&apos;t just believe it.
            <br />
            <span className="bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
              Check it.
            </span>
          </h2>

          <p className="mx-auto mt-7 max-w-2xl text-base leading-7 text-zinc-400 md:text-lg">
            Enter a claim and Truth Checker investigates it using available
            web evidence and AI analysis — then turns the findings into a
            clear, understandable verdict.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-11 max-w-3xl"
          >
            <div className="group rounded-[26px] border border-white/[0.10] bg-white/[0.035] p-2 shadow-2xl shadow-black/40 backdrop-blur-xl transition duration-300 focus-within:border-white/[0.18] focus-within:bg-white/[0.045]">
              <textarea
                id="claim-box"
                value={claim}
                onChange={(event) => {
                  setClaim(event.target.value);

                  if (error) {
                    setError("");
                  }
                }}
                placeholder='Try: "Humans only use 10% of their brains."'
                maxLength={500}
                rows={4}
                disabled={loading}
                className="w-full resize-none rounded-[20px] bg-transparent px-5 py-5 text-[15px] leading-7 text-white outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
              />

              <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-2 pt-2">
                <span className="px-3 text-xs tabular-nums text-zinc-600">
                  {claim.length}/500
                </span>

                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-[17px] bg-white px-6 py-3.5 text-sm font-bold text-black shadow-xl shadow-white/[0.04] transition duration-200 hover:-translate-y-0.5 hover:bg-zinc-200 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Investigating..." : "Check claim →"}
                </button>
              </div>
            </div>
          </form>

          {!loading && !result && (
            <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-2">
              <span className="mr-1 text-xs text-zinc-600">
                Try an example:
              </span>

              {exampleClaims.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => handleExample(example)}
                  className="rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-500 transition hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-zinc-300"
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mx-auto mt-5 max-w-3xl rounded-2xl border border-red-400/20 bg-red-400/[0.05] px-5 py-4 text-left text-sm leading-6 text-red-300"
            >
              <div className="flex gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-red-400/30 text-[10px] font-bold">
                  !
                </span>

                <span>{error}</span>
              </div>
            </div>
          )}
        </section>

        {!loading && !result && (
          <section className="mx-auto mt-20 max-w-5xl">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  number: "01",
                  title: "Submit a claim",
                  text: "Give Truth Checker a statement you want to investigate.",
                },
                {
                  number: "02",
                  title: "Compare evidence",
                  text: "Relevant sources are gathered and the available findings are analyzed.",
                },
                {
                  number: "03",
                  title: "Understand the result",
                  text: "Get a verdict, confidence level, reasoning, context, and sources.",
                },
              ].map((item) => (
                <div
                  key={item.number}
                  className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-6 transition duration-300 hover:-translate-y-1 hover:border-white/[0.12] hover:bg-white/[0.035]"
                >
                  <span className="text-xs font-bold tracking-[0.2em] text-zinc-700">
                    {item.number}
                  </span>

                  <h3 className="mt-7 font-semibold text-zinc-200">
                    {item.title}
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {loading && (
          <section className="mx-auto mt-16 max-w-4xl">
            <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.025] p-7 shadow-2xl shadow-black/30 backdrop-blur-xl md:p-9">
              <div className="mb-7 flex items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-400" />

                    <p className="font-semibold">
                      Investigating your claim
                    </p>
                  </div>

                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    {investigationStages[activeStage].description}
                  </p>
                </div>

                <span className="shrink-0 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-xs tabular-nums text-zinc-500">
                  {activeStage + 1}/{investigationStages.length}
                </span>
              </div>

              <div className="mb-8 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-white transition-all duration-700"
                  style={{
                    width: `${
                      ((activeStage + 1) /
                        investigationStages.length) *
                      100
                    }%`,
                  }}
                />
              </div>

              <div className="space-y-1">
                {investigationStages.map((stage, index) => {
                  const active = index === activeStage;
                  const complete = index < activeStage;

                  return (
                    <div
                      key={stage.title}
                      className={`flex gap-4 rounded-2xl px-4 py-4 transition-all duration-500 md:px-5 ${
                        active
                          ? "bg-white/[0.045]"
                          : complete
                            ? "opacity-80"
                            : "opacity-45"
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-all duration-500 ${
                          complete
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                            : active
                              ? "border-white/20 bg-white text-black"
                              : "border-white/[0.08] bg-white/[0.02] text-zinc-600"
                        }`}
                      >
                        {complete ? "✓" : index + 1}
                      </div>

                      <div>
                        <p
                          className={`text-sm font-semibold ${
                            active ? "text-white" : "text-zinc-500"
                          }`}
                        >
                          {stage.title}
                        </p>

                        <p
                          className={`mt-1 text-sm leading-6 ${
                            active ? "text-zinc-400" : "text-zinc-600"
                          }`}
                        >
                          {stage.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-7 rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
                <p className="text-center text-xs text-zinc-600">
                  Evidence is being analyzed. This may take a moment.
                </p>
              </div>
            </div>
          </section>
        )}

        {result?.investigation && (
          <section className="mx-auto mt-16 max-w-5xl space-y-5">
            <div
              className={`rounded-[28px] border p-7 shadow-2xl shadow-black/25 md:p-9 ${verdictBackground(
                result.investigation.verdict
              )}`}
            >
              <div className="flex flex-col justify-between gap-7 md:flex-row md:items-start">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                      Investigation result
                    </p>

                    <span className="h-px w-8 bg-white/[0.10]" />
                  </div>

                  <h3
                    className={`mt-4 text-4xl font-black tracking-tight md:text-5xl ${verdictColor(
                      result.investigation.verdict
                    )}`}
                  >
                    {result.investigation.verdict}
                  </h3>

                  <p className="mt-3 text-sm text-zinc-500">
                    {verdictDescription}
                  </p>

                  <p className="mt-5 text-base leading-7 text-zinc-300">
                    {result.investigation.summary}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
                  <div
                    className={`rounded-full border px-4 py-2 text-xs font-semibold ${confidenceColor(
                      result.investigation.confidence
                    )}`}
                  >
                    {result.investigation.confidence} confidence
                  </div>

                  <button
                    type="button"
                    onClick={copyResult}
                    className="rounded-full border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    {copied ? "✓ Copied result" : "Copy result"}
                  </button>
                </div>
              </div>

              <div className="mt-8 rounded-2xl border border-white/[0.06] bg-black/20 p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
                  Claim investigated
                </p>

                <p className="mt-2 text-sm leading-7 text-zinc-300">
                  {result.claim}
                </p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-7 shadow-xl shadow-black/20 md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">
                      Why
                    </p>

                    <h3 className="mt-2 text-xl font-bold">
                      Reasoning
                    </h3>
                  </div>

                  <span className="rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 text-[10px] font-semibold text-zinc-600">
                    {reasoningCount} points
                  </span>
                </div>

                <div className="mt-7 space-y-5">
                  {result.investigation.reasoning.map(
                    (item, index) => (
                      <div
                        key={`${item}-${index}`}
                        className="flex gap-4"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025] text-[10px] font-bold text-zinc-500">
                          {String(index + 1).padStart(2, "0")}
                        </div>

                        <p className="text-sm leading-7 text-zinc-400">
                          {item}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-7 shadow-xl shadow-black/20 md:p-8">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">
                  Context
                </p>

                <h3 className="mt-2 text-xl font-bold">
                  Important nuance
                </h3>

                <div className="mt-7 rounded-2xl border border-white/[0.06] bg-black/20 p-5">
                  <p className="text-sm leading-7 text-zinc-400">
                    {result.investigation.context}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-600">
                      Confidence
                    </p>

                    <p className="mt-2 text-sm font-semibold text-zinc-300">
                      {confidenceLabel}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-600">
                      Sources
                    </p>

                    <p className="mt-2 text-sm font-semibold text-zinc-300">
                      {evidenceCount}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-7 shadow-xl shadow-black/20 md:p-8">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">
                    Web evidence
                  </p>

                  <h3 className="mt-2 text-2xl font-bold">
                    Sources checked
                  </h3>

                  <p className="mt-2 text-sm text-zinc-500">
                    Review the underlying sources yourself before making
                    an important decision.
                  </p>
                </div>

                <span className="w-fit rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-600">
                  {evidenceCount} sources
                </span>
              </div>

              <div className="mt-7 grid gap-3">
                {result.evidence?.map((source, index) => (
                  <a
                    key={`${source.url}-${index}`}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-2xl border border-white/[0.06] bg-black/20 p-5 transition duration-300 hover:-translate-y-0.5 hover:border-white/[0.13] hover:bg-white/[0.035]"
                  >
                    <div className="flex gap-4">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.025] text-xs font-bold text-zinc-500 transition group-hover:bg-white group-hover:text-black">
                        {index + 1}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-5">
                          <h4 className="font-semibold leading-6 text-zinc-200 group-hover:text-white">
                            {source.title}
                          </h4>

                          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-zinc-700">
                            {getDomain(source.url)}
                          </span>
                        </div>

                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-zinc-500">
                          {source.snippet}
                        </p>

                        <div className="mt-4 flex items-center gap-2 text-xs text-zinc-700">
                          <span className="truncate">
                            {source.url}
                          </span>

                          <span className="shrink-0 text-zinc-600">
                            ↗
                          </span>
                        </div>
                      </div>
                    </div>
                  </a>
                ))}

                {evidenceCount === 0 && (
                  <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-6 text-sm text-zinc-500">
                    No web sources were returned for this investigation.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-7 shadow-xl shadow-black/20 md:p-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-600">
                Verification
              </p>

              <h3 className="mt-2 text-xl font-bold">
                Evidence worth checking
              </h3>

              <p className="mt-2 text-sm text-zinc-500">
                These are the areas that matter most when independently
                verifying the conclusion.
              </p>

              <div className="mt-7 grid gap-3 md:grid-cols-2">
                {result.investigation.evidenceToCheck.map(
                  (item, index) => (
                    <div
                      key={`${item}-${index}`}
                      className="flex gap-3 rounded-2xl border border-white/[0.06] bg-black/20 p-4 transition hover:border-white/[0.10] hover:bg-white/[0.025]"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-[9px] font-bold text-zinc-600">
                        {String(index + 1).padStart(2, "0")}
                      </span>

                      <p className="text-sm leading-6 text-zinc-400">
                        {item}
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
              <p className="text-sm text-zinc-600">
                Ready to investigate something else?
              </p>

              <button
                type="button"
                onClick={resetInvestigation}
                className="rounded-full border border-white/[0.10] bg-white/[0.035] px-6 py-3 text-sm font-semibold text-zinc-300 shadow-xl shadow-black/20 transition duration-200 hover:-translate-y-0.5 hover:bg-white hover:text-black"
              >
                Investigate another claim →
              </button>
            </div>
          </section>
        )}

        <footer className="mt-24 border-t border-white/[0.06] py-9 text-center">
          <p className="text-xs leading-6 text-zinc-600">
            Truth Checker analyzes available evidence — it does not replace
            primary sources, expert advice, or professional judgment.
          </p>

          <p className="mt-4 text-xs font-medium tracking-wide text-zinc-700">
            Created by Koglesh R. Murugan
          </p>
        </footer>
      </div>
    </main>
  );
}