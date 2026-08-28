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
    metadata?: unknown;
  };
};

const TAVILY_URL = "https://api.tavily.com/search";
const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

/*
 * IMPORTANT:
 * We intentionally use OpenRouter's FREE ROUTER instead
 * of hard-coding Gemma, Nemotron, Dots, etc.
 *
 * The router chooses an available free model.
 */
const MODEL = "openrouter/free";

const MAX_CLAIM_LENGTH = 500;
const MAX_EVIDENCE_SOURCES = 5;
const MAX_SNIPPET_LENGTH = 2200;

const TAVILY_TIMEOUT_MS = 20000;
const OPENROUTER_TIMEOUT_MS = 45000;

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

function cleanModelJson(text: string): string {
  let value = text.trim();

  // Remove markdown fences.
  value = value.replace(/^```json\s*/i, "");
  value = value.replace(/^```\s*/i, "");
  value = value.replace(/\s*```$/i, "");

  value = value.trim();

  /*
   * Some models occasionally return:
   *
   * {
   *   {...actual JSON...}
   * }
   *
   * or add a little text before/after JSON.
   *
   * Find the outermost JSON object.
   */
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");

  if (first !== -1 && last > first) {
    value = value.slice(first, last + 1);
  }

  return value.trim();
}

function validateInvestigation(
  value: unknown
): value is Investigation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Record<string, unknown>;

  const verdicts = [
    "Likely true",
    "Likely false",
    "Misleading",
    "Unclear",
  ];

  const confidenceLevels = [
    "High",
    "Medium",
    "Low",
  ];

  if (
    typeof data.verdict !== "string" ||
    !verdicts.includes(data.verdict)
  ) {
    return false;
  }

  if (
    typeof data.confidence !== "string" ||
    !confidenceLevels.includes(data.confidence)
  ) {
    return false;
  }

  if (
    typeof data.summary !== "string" ||
    !data.summary.trim()
  ) {
    return false;
  }

  if (
    !Array.isArray(data.reasoning) ||
    data.reasoning.length < 2 ||
    data.reasoning.length > 4
  ) {
    return false;
  }

  if (
    !data.reasoning.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0
    )
  ) {
    return false;
  }

  if (
    typeof data.context !== "string" ||
    !data.context.trim()
  ) {
    return false;
  }

  if (
    !Array.isArray(data.evidenceToCheck) ||
    data.evidenceToCheck.length < 2 ||
    data.evidenceToCheck.length > 4
  ) {
    return false;
  }

  if (
    !data.evidenceToCheck.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0
    )
  ) {
    return false;
  }

  return true;
}

async function searchEvidence(
  claim: string
): Promise<EvidenceSource[]> {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error(
      "TAVILY_API_KEY is not configured."
    );
  }

  console.log("TAVILY_SEARCH_START");

  let response: Response;

  try {
    response = await fetch(TAVILY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
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
      signal: timeoutSignal(TAVILY_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(
      "TAVILY_REQUEST_FAILED:",
      error
    );

    throw new Error(
      "The evidence search could not be reached."
    );
  }

  if (!response.ok) {
    const errorText = await response.text();

    console.error(
      "TAVILY_ERROR:",
      response.status,
      errorText.slice(0, 2000)
    );

    throw new Error(
      `The evidence search failed (${response.status}).`
    );
  }

  let data: TavilyResponse;

  try {
    data =
      (await response.json()) as TavilyResponse;
  } catch (error) {
    console.error(
      "TAVILY_INVALID_JSON:",
      error
    );

    throw new Error(
      "The evidence search returned invalid data."
    );
  }

  const sources =
    (data.results ?? [])
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
            ? (item.content as string).slice(
                0,
                MAX_SNIPPET_LENGTH
              )
            : "No summary available.",
      }))
      .slice(0, MAX_EVIDENCE_SOURCES);

  console.log(
    `TAVILY_SEARCH_COMPLETE: ${sources.length} sources`
  );

  return sources;
}

function buildEvidenceText(
  evidence: EvidenceSource[]
): string {
  return evidence
    .map(
      (source, index) =>
        `SOURCE ${index + 1}
Title: ${source.title}
URL: ${source.url}
Evidence: ${source.snippet}`
    )
    .join("\n\n---\n\n");
}

function buildPrompt(
  claim: string,
  evidence: EvidenceSource[]
): string {
  return `
You are the Truth Checker analysis engine.

Your job is to evaluate the CLAIM using ONLY the WEB EVIDENCE supplied below.

Do not use outside knowledge as evidence.

Be conservative and factual.

Allowed verdicts:
- Likely true
- Likely false
- Misleading
- Unclear

Allowed confidence:
- High
- Medium
- Low

Rules:
- Never invent evidence.
- Never invent sources.
- Never invent URLs.
- Never invent statistics.
- Never invent quotations.
- Never invent dates.
- Do not assume a source is correct merely because it appears in search results.
- If sources disagree, explain the disagreement.
- If evidence is insufficient, use Unclear.
- "Not proven" does NOT automatically mean false.
- Keep the answer concise.

Return ONLY valid JSON.

Use exactly this structure:

{
  "verdict": "Likely true",
  "confidence": "High",
  "summary": "Short explanation.",
  "reasoning": [
    "Reason one.",
    "Reason two."
  ],
  "context": "Important nuance.",
  "evidenceToCheck": [
    "Evidence category one.",
    "Evidence category two."
  ]
}

Requirements:
- reasoning: 2 to 4 strings
- evidenceToCheck: 2 to 4 strings
- summary: concise
- context: concise
- no additional fields
- valid JSON only

CLAIM:
${claim}

WEB EVIDENCE:
${buildEvidenceText(evidence)}
`.trim();
}

async function callOpenRouter(
  prompt: string
): Promise<Investigation> {
  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured."
    );
  }

  console.log(
    "OPENROUTER_REQUEST: openrouter/free"
  );

  let response: Response;

  try {
    response = await fetch(
      OPENROUTER_URL,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",

          // Keep these headers simple ASCII.
          // This also avoids the ByteString problem
          // you previously encountered.
          "HTTP-Referer":
            "https://truth-checker-eight.vercel.app",

          "X-Title":
            "Truth Checker",
        },

        body: JSON.stringify({
          model: MODEL,

          messages: [
            {
              role: "system",
              content:
                "You are a factual evidence-analysis engine. Return ONLY valid JSON.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],

          /*
           * JSON object mode is intentionally used instead
           * of strict JSON schema.
           *
           * Free models vary in how well they implement
           * strict schema enforcement.
           */
          response_format: {
            type: "json_object",
          },

          /*
           * Keep reasoning disabled/minimal so the model
           * spends its output budget on the actual JSON.
           */
          reasoning: {
            effort: "none",
            exclude: true,
          },

          temperature: 0,

          /*
           * Enough room for the small JSON object,
           * while avoiding unnecessarily huge generations.
           */
          max_tokens: 1000,

          stream: false,

          /*
           * Let OpenRouter choose an available provider.
           */
          provider: {
            allow_fallbacks: true,
          },
        }),

        cache: "no-store",

        signal: timeoutSignal(
          OPENROUTER_TIMEOUT_MS
        ),
      }
    );
  } catch (error) {
    console.error(
      "OPENROUTER_NETWORK_ERROR:",
      error
    );

    if (
      error instanceof Error &&
      error.name === "TimeoutError"
    ) {
      throw new Error(
        "The free AI service took too long to respond. Please try again."
      );
    }

    throw new Error(
      "The cloud AI could not be reached."
    );
  }

  const rawText = await response.text();

  if (!response.ok) {
    console.error(
      "OPENROUTER_HTTP_ERROR:",
      response.status,
      rawText.slice(0, 4000)
    );

    if (response.status === 429) {
      throw new Error(
        "The free AI service is temporarily rate-limited. Please try again shortly."
      );
    }

    if (response.status >= 500) {
      throw new Error(
        "The free AI service is temporarily unavailable. Please try again shortly."
      );
    }

    throw new Error(
      `The cloud AI request failed (${response.status}).`
    );
  }

  let data: OpenRouterResponse;

  try {
    data =
      JSON.parse(rawText) as OpenRouterResponse;
  } catch (error) {
    console.error(
      "OPENROUTER_INVALID_HTTP_JSON:",
      error
    );

    console.error(
      "OPENROUTER_RAW:",
      rawText.slice(0, 4000)
    );

    throw new Error(
      "The cloud AI returned an invalid response."
    );
  }

  if (data.error) {
    console.error(
      "OPENROUTER_RESPONSE_ERROR:",
      data.error
    );

    throw new Error(
      typeof data.error.message === "string"
        ? data.error.message
        : "The cloud AI returned an error."
    );
  }

  const choice =
    data.choices?.[0];

  if (!choice) {
    console.error(
      "OPENROUTER_NO_CHOICE:",
      JSON.stringify(data).slice(0, 4000)
    );

    throw new Error(
      "The cloud AI returned no result."
    );
  }

  const finishReason =
    typeof choice.finish_reason === "string"
      ? choice.finish_reason
      : "unknown";

  const content =
    typeof choice.message?.content ===
    "string"
      ? choice.message.content.trim()
      : "";

  console.log(
    "OPENROUTER_SUCCESS:",
    JSON.stringify({
      model: data.model,
      finishReason,
      hasContent: Boolean(content),
    })
  );

  if (!content) {
    throw new Error(
      "The cloud AI returned no analysis."
    );
  }

  /*
   * If the provider stopped because it hit the
   * token limit, the JSON may be incomplete.
   *
   * Do not try to pretend incomplete JSON is valid.
   */
  if (
    finishReason === "length"
  ) {
    console.error(
      "OPENROUTER_TRUNCATED_RESPONSE:",
      content.slice(0, 4000)
    );

    throw new Error(
      "The free AI model stopped before completing its answer. Please try again."
    );
  }

  const cleaned =
    cleanModelJson(content);

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error(
      "OPENROUTER_PARSE_ERROR:",
      error
    );

    console.error(
      "OPENROUTER_CONTENT:",
      content.slice(0, 4000)
    );

    throw new Error(
      "The cloud AI returned invalid JSON. Please try again."
    );
  }

  if (
    !validateInvestigation(parsed)
  ) {
    console.error(
      "OPENROUTER_INVALID_RESULT:",
      JSON.stringify(parsed).slice(
        0,
        4000
      )
    );

    throw new Error(
      "The cloud AI returned an incomplete investigation. Please try again."
    );
  }

  return parsed;
}

export async function POST(
  request: Request
) {
  try {
    const body: unknown =
      await request.json();

    const claim =
      typeof body === "object" &&
      body !== null &&
      "claim" in body &&
      typeof body.claim === "string"
        ? body.claim.trim()
        : "";

    if (!claim) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Please enter a claim to investigate.",
        },
        { status: 400 }
      );
    }

    if (
      claim.length >
      MAX_CLAIM_LENGTH
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Claims must be ${MAX_CLAIM_LENGTH} characters or fewer.`,
        },
        { status: 400 }
      );
    }

    if (
      !process.env.TAVILY_API_KEY
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Tavily API key is not configured.",
        },
        { status: 500 }
      );
    }

    if (
      !process.env.OPENROUTER_API_KEY
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "OpenRouter API key is not configured.",
        },
        { status: 500 }
      );
    }

    console.log(
      "TRUTH_CHECKER_START:",
      claim
    );

    console.log(
      "TRUTH_CHECKER_SEARCHING"
    );

    const evidence =
      await searchEvidence(claim);

    console.log(
      `TRUTH_CHECKER_EVIDENCE_COUNT: ${evidence.length}`
    );

    if (evidence.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No web evidence was found for this claim.",
        },
        { status: 502 }
      );
    }

    console.log(
      "TRUTH_CHECKER_ANALYZING"
    );

    const prompt =
      buildPrompt(
        claim,
        evidence
      );

    const investigation =
      await callOpenRouter(prompt);

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
    console.error(
      "TRUTH_CHECKER_API_ERROR:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "The investigation could not be completed.";

    const status =
      message.includes(
        "rate-limited"
      )
        ? 429
        : message.includes(
            "temporarily unavailable"
          )
        ? 503
        : message.includes(
            "No web evidence"
          )
        ? 502
        : 500;

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    );
  }
}