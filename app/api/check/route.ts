import { NextResponse } from "next/server";

type EvidenceSource = {
  title: string;
  url: string;
  snippet: string;
};

type Investigation = {
  verdict:
    | "Likely true"
    | "Likely false"
    | "Misleading"
    | "Unclear";
  confidence: "High" | "Medium" | "Low";
  summary: string;
  reasoning: string[];
  context: string;
  evidenceToCheck: string[];
};

type TavilyResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
};

type TavilyResponse = {
  results?: TavilyResult[];
};

type OpenRouterResponse = {
  model?: unknown;
  choices?: Array<{
    finish_reason?: unknown;
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TAVILY_URL = "https://api.tavily.com/search";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const FREE_MODEL = "openrouter/free";

const MAX_CLAIM_LENGTH = 500;
const MAX_EVIDENCE_SOURCES = 5;
const MAX_EVIDENCE_CHARS_PER_SOURCE = 3000;
const TAVILY_TIMEOUT_MS = 10000;
const OPENROUTER_TIMEOUT_MS = 18000;
const OPENROUTER_ATTEMPTS = 2;

function createTimeoutSignal(milliseconds: number): AbortSignal {
  return AbortSignal.timeout(milliseconds);
}

function createHttpError(message: string, status: number): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function getErrorStatus(error: unknown): number | undefined {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }

  return undefined;
}

function extractJsonObject(text: string): string | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  if (firstBrace === -1) return null;

  let depth = 0;
  let insideString = false;
  let escaped = false;

  for (let index = firstBrace; index < cleaned.length; index++) {
    const character = cleaned[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === '"') {
      insideString = !insideString;
      continue;
    }

    if (insideString) continue;

    if (character === "{") depth++;

    if (character === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(firstBrace, index + 1);
    }
  }

  return null;
}

function isValidInvestigation(value: unknown): value is Investigation {
  if (!value || typeof value !== "object") return false;

  const data = value as Record<string, unknown>;
  const validVerdicts = [
    "Likely true",
    "Likely false",
    "Misleading",
    "Unclear",
  ];
  const validConfidence = ["High", "Medium", "Low"];

  if (
    typeof data.verdict !== "string" ||
    !validVerdicts.includes(data.verdict)
  ) return false;

  if (
    typeof data.confidence !== "string" ||
    !validConfidence.includes(data.confidence)
  ) return false;

  if (typeof data.summary !== "string" || !data.summary.trim()) return false;

  if (
    !Array.isArray(data.reasoning) ||
    data.reasoning.length < 2 ||
    data.reasoning.length > 4 ||
    !data.reasoning.every(
      (item) => typeof item === "string" && item.trim().length > 0
    )
  ) return false;

  if (typeof data.context !== "string" || !data.context.trim()) return false;

  if (
    !Array.isArray(data.evidenceToCheck) ||
    data.evidenceToCheck.length < 2 ||
    data.evidenceToCheck.length > 4 ||
    !data.evidenceToCheck.every(
      (item) => typeof item === "string" && item.trim().length > 0
    )
  ) return false;

  return true;
}

async function searchEvidence(claim: string): Promise<EvidenceSource[]> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw createHttpError("Tavily API key is not configured.", 500);
  }

  console.log("TAVILY_SEARCH_START");

  let response: Response;

  try {
    response = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: claim,
        search_depth: "advanced",
        topic: "general",
        max_results: MAX_EVIDENCE_SOURCES,
        include_answer: false,
        include_raw_content: false,
      }),
      cache: "no-store",
      signal: createTimeoutSignal(TAVILY_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("TAVILY_REQUEST_FAILED:", error);

    if (error instanceof Error && error.name === "TimeoutError") {
      throw createHttpError(
        "The evidence search took too long. Please try again.",
        504
      );
    }

    throw createHttpError(
      "The evidence search could not be reached.",
      502
    );
  }

  const rawText = await response.text();

  if (!response.ok) {
    console.error(
      "TAVILY_HTTP_ERROR:",
      response.status,
      rawText.slice(0, 2000)
    );

    if (response.status === 429) {
      throw createHttpError(
        "The evidence search is temporarily rate-limited. Please try again shortly.",
        429
      );
    }

    throw createHttpError(
      `The evidence search failed (${response.status}).`,
      502
    );
  }

  let data: TavilyResponse;

  try {
    data = JSON.parse(rawText) as TavilyResponse;
  } catch (error) {
    console.error("TAVILY_INVALID_JSON:", error);
    throw createHttpError(
      "The evidence search returned invalid data.",
      502
    );
  }

  const sources = (data.results ?? [])
    .filter(
      (item) =>
        typeof item.title === "string" &&
        typeof item.url === "string"
    )
    .map((item) => ({
      title: item.title as string,
      url: item.url as string,
      snippet:
        typeof item.content === "string"
          ? item.content
          : "No source summary was provided.",
    }))
    .slice(0, MAX_EVIDENCE_SOURCES);

  console.log(`TAVILY_SEARCH_COMPLETE: ${sources.length} sources`);
  return sources;
}

function buildEvidenceText(evidence: EvidenceSource[]): string {
  return evidence
    .map((source, index) => {
      const snippet = source.snippet.slice(
        0,
        MAX_EVIDENCE_CHARS_PER_SOURCE
      );

      return [
        `SOURCE ${index + 1}`,
        `Title: ${source.title}`,
        `URL: ${source.url}`,
        `Content: ${snippet}`,
      ].join("\n");
    })
    .join("\n\n--------------------\n\n");
}

function buildPrompt(claim: string, evidence: EvidenceSource[]): string {
  return `You are the evidence-analysis engine for Truth Checker.

Evaluate the CLAIM using ONLY the WEB EVIDENCE supplied below.

Rules:
1. Do not use outside knowledge as evidence.
2. Do not invent facts, sources, URLs, dates, statistics, or quotations.
3. Compare sources instead of trusting one source automatically.
4. Decide whether each source supports, contradicts, or only discusses the claim.
5. Do not treat absence of proof as proof of falsity.
6. Use "Unclear" when the supplied evidence is insufficient or genuinely conflicting.
7. Use "Misleading" when the claim is materially incomplete, exaggerated, or context-dependent.
8. Confidence reflects how strongly the supplied evidence supports the verdict.

Allowed verdicts:
- Likely true
- Likely false
- Misleading
- Unclear

Allowed confidence:
- High
- Medium
- Low

Return ONLY one valid JSON object. No markdown. No code fences. No text before or after it.

Return exactly this structure:
{
  "verdict": "Likely true",
  "confidence": "High",
  "summary": "Concise evidence-based explanation.",
  "reasoning": [
    "Specific reason based on the supplied evidence.",
    "Another specific reason based on the supplied evidence."
  ],
  "context": "Important qualification or limitation.",
  "evidenceToCheck": [
    "A useful evidence category to verify.",
    "Another useful evidence category to verify."
  ]
}

Requirements:
- reasoning: 2 to 4 strings
- evidenceToCheck: 2 to 4 strings
- summary: concise
- context: concise
- no additional fields

CLAIM:
${claim}

WEB EVIDENCE:
${buildEvidenceText(evidence)}`.trim();
}

function createEvidenceOnlyFallback(
  claim: string,
  evidence: EvidenceSource[]
): Investigation {
  const domains = Array.from(
    new Set(
      evidence.map((source) => {
        try {
          return new URL(source.url).hostname.replace(/^www\./, "");
        } catch {
          return "source";
        }
      })
    )
  ).slice(0, 4);

  return {
    verdict: "Unclear",
    confidence: "Low",
    summary:
      `The web search found ${evidence.length} source${evidence.length === 1 ? "" : "s"}, but the AI analysis service did not return a usable result. No factual verdict was assigned.`,
    reasoning: [
      "The claim was searched against available web evidence, but automated synthesis could not be completed reliably.",
      domains.length
        ? `Retrieved evidence came from: ${domains.join(", ")}.`
        : "Retrieved evidence could not be reliably identified by domain.",
    ],
    context:
      `Claim checked: "${claim}". Truth Checker uses a safe fallback instead of guessing when AI analysis fails.`,
    evidenceToCheck: [
      "Primary or official sources directly addressing the claim",
      "Independent high-quality sources that confirm or contradict the claim",
    ],
  };
}

async function callOpenRouterOnce(
  prompt: string,
  attempt: number
): Promise<Investigation> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw createHttpError(
      "OpenRouter API key is not configured.",
      500
    );
  }

  console.log(
    `OPENROUTER_REQUEST_START: model=${FREE_MODEL} attempt=${attempt}`
  );

  let response: Response;

  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://truth-checker-app.vercel.app",
        "X-Title": "Truth Checker",
      },
      body: JSON.stringify({
        model: FREE_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a careful evidence-analysis engine. Return only valid JSON matching the requested structure. Never use markdown.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0,
        max_tokens: 900,
        stream: false,
      }),
      cache: "no-store",
      signal: createTimeoutSignal(OPENROUTER_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("OPENROUTER_NETWORK_ERROR:", error);

    if (error instanceof Error && error.name === "TimeoutError") {
      throw createHttpError(
        "The AI provider took too long to respond.",
        504
      );
    }

    throw createHttpError("Could not reach OpenRouter.", 502);
  }

  const rawText = await response.text();

  console.log(
    "OPENROUTER_HTTP_RESPONSE:",
    JSON.stringify({
      status: response.status,
      body: rawText.slice(0, 2000),
    })
  );

  if (!response.ok) {
    let providerMessage = "";

    try {
      const providerData = JSON.parse(rawText) as OpenRouterResponse;
      if (
        providerData.error &&
        typeof providerData.error.message === "string"
      ) {
        providerMessage = providerData.error.message;
      }
    } catch {
      // Keep the generic message when the provider did not return JSON.
    }

    if (response.status === 429) {
      throw createHttpError(
        "The free AI models are temporarily rate-limited.",
        429
      );
    }

    if ([408, 500, 502, 503, 504].includes(response.status)) {
      throw createHttpError(
        "The AI provider is temporarily unavailable.",
        503
      );
    }

    throw createHttpError(
      providerMessage || `OpenRouter request failed (${response.status}).`,
      response.status
    );
  }

  let data: OpenRouterResponse;

  try {
    data = JSON.parse(rawText) as OpenRouterResponse;
  } catch (error) {
    console.error("OPENROUTER_INVALID_JSON:", error);
    throw createHttpError(
      "OpenRouter returned invalid response data.",
      502
    );
  }

  if (data.error) {
    const message =
      typeof data.error.message === "string"
        ? data.error.message
        : "OpenRouter returned an API error.";

    throw createHttpError(message, 502);
  }

  const choice = data.choices?.[0];

  if (!choice) {
    throw createHttpError(
      "OpenRouter returned no model response.",
      502
    );
  }

  const content =
    typeof choice.message?.content === "string"
      ? choice.message.content.trim()
      : "";

  console.log(
    "OPENROUTER_RESPONSE_META:",
    JSON.stringify({
      requestedModel: FREE_MODEL,
      actualModel: data.model,
      finishReason: choice.finish_reason,
      hasContent: Boolean(content),
      contentLength: content.length,
    })
  );

  if (!content) {
    throw createHttpError(
      "OpenRouter returned empty content.",
      502
    );
  }

  const jsonText = extractJsonObject(content);

  if (!jsonText) {
    console.error("OPENROUTER_NO_JSON:", content.slice(0, 3000));
    throw createHttpError(
      "The AI returned no usable JSON.",
      502
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    console.error("OPENROUTER_JSON_PARSE_ERROR:", error);
    throw createHttpError(
      "The AI returned invalid JSON.",
      502
    );
  }

  if (!isValidInvestigation(parsed)) {
    console.error(
      "OPENROUTER_INVALID_INVESTIGATION:",
      JSON.stringify(parsed).slice(0, 3000)
    );

    throw createHttpError(
      "The AI returned an incomplete investigation.",
      502
    );
  }

  return parsed;
}

async function analyzeWithOpenRouter(
  prompt: string
): Promise<Investigation> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= OPENROUTER_ATTEMPTS; attempt++) {
    try {
      return await callOpenRouterOnce(prompt, attempt);
    } catch (error) {
      lastError = error;
      console.error(
        `OPENROUTER_ATTEMPT_FAILED: ${attempt}`,
        error
      );

      if (attempt < OPENROUTER_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : createHttpError("AI analysis failed.", 502);
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    const claim =
      typeof body === "object" &&
      body !== null &&
      "claim" in body &&
      typeof (body as { claim?: unknown }).claim === "string"
        ? (body as { claim: string }).claim.trim()
        : "";

    if (!claim) {
      return NextResponse.json(
        {
          success: false,
          error: "Please enter a claim to investigate.",
        },
        { status: 400 }
      );
    }

    if (claim.length > MAX_CLAIM_LENGTH) {
      return NextResponse.json(
        {
          success: false,
          error: `Claims must be ${MAX_CLAIM_LENGTH} characters or fewer.`,
        },
        { status: 400 }
      );
    }

    if (!process.env.TAVILY_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "Tavily API key is not configured.",
        },
        { status: 500 }
      );
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "OpenRouter API key is not configured.",
        },
        { status: 500 }
      );
    }

    console.log("TRUTH_CHECKER_START");

    const evidence = await searchEvidence(claim);

    console.log(
      `TRUTH_CHECKER_EVIDENCE_COUNT: ${evidence.length}`
    );

    if (evidence.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No web evidence was found for this claim.",
        },
        { status: 502 }
      );
    }

    let investigation: Investigation;

    try {
      console.log("TRUTH_CHECKER_ANALYZING");
      investigation = await analyzeWithOpenRouter(
        buildPrompt(claim, evidence)
      );
    } catch (error) {
      console.error("TRUTH_CHECKER_AI_FALLBACK:", error);
      investigation = createEvidenceOnlyFallback(claim, evidence);
    }

    console.log(
      "TRUTH_CHECKER_COMPLETE:",
      investigation.verdict,
      investigation.confidence
    );

    return NextResponse.json({
      success: true,
      claim,
      investigation,
      evidence,
    });
  } catch (error) {
    console.error("TRUTH_CHECKER_API_ERROR:", error);

    const message =
      error instanceof Error
        ? error.message
        : "The investigation could not be completed.";

    const status = getErrorStatus(error);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status:
          status && status >= 400 && status <= 599
            ? status
            : 500,
      }
    );
  }
}
