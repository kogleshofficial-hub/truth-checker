import { NextResponse } from "next/server";

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

type TavilyResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
};

type TavilyResponse = {
  results?: TavilyResult[];
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
    code?: unknown;
  };
};

const TAVILY_URL = "https://api.tavily.com/search";
const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const MODEL = "google/gemma-4-31b-it:free";

const MAX_CLAIM_LENGTH = 500;
const MAX_SOURCES = 5;
const MAX_SNIPPET_LENGTH = 5000;
const REQUEST_TIMEOUT_MS = 30000;

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function cleanJson(text: string): string {
  let result = text.trim();

  result = result.replace(/^```json\s*/i, "");
  result = result.replace(/^```\s*/i, "");
  result = result.replace(/\s*```$/i, "");
  result = result.trim();

  const firstBrace = result.indexOf("{");
  const lastBrace = result.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    result = result.slice(firstBrace, lastBrace + 1);
  }

  return result.trim();
}

function isValidInvestigation(
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
    data.summary.trim().length === 0
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
    data.context.trim().length === 0
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
  const apiKey = process.env.TAVILY_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "TAVILY_API_KEY is not configured."
    );
  }

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
        max_results: MAX_SOURCES,
        include_answer: false,
        include_raw_content: false,
      }),
      cache: "no-store",
      signal: timeoutSignal(),
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

  const responseText = await response.text();

  if (!response.ok) {
    console.error(
      "TAVILY_ERROR:",
      response.status,
      responseText.slice(0, 3000)
    );

    throw new Error(
      `The evidence search failed (${response.status}).`
    );
  }

  let data: TavilyResponse;

  try {
    data = JSON.parse(
      responseText
    ) as TavilyResponse;
  } catch (error) {
    console.error(
      "TAVILY_INVALID_JSON:",
      error
    );

    throw new Error(
      "The evidence search returned an invalid response."
    );
  }

  return (data.results ?? [])
    .filter(
      (item) =>
        typeof item.title === "string" &&
        typeof item.url === "string"
    )
    .map((item) => ({
      title: (item.title as string).trim(),
      url: (item.url as string).trim(),
      snippet:
        typeof item.content === "string"
          ? item.content
              .trim()
              .slice(0, MAX_SNIPPET_LENGTH)
          : "No summary available.",
    }))
    .slice(0, MAX_SOURCES);
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

Content:
${source.snippet}`
    )
    .join(
      "\n\n--------------------\n\n"
    );
}

function buildPrompt(
  claim: string,
  evidence: EvidenceSource[]
): string {
  return `
You are the evidence-analysis engine for Truth Checker.

Your task is to evaluate the user's claim using ONLY the supplied web evidence.

Be neutral, conservative, precise, and evidence-first.

Rules:

1. Never invent sources.
2. Never invent URLs.
3. Never invent studies.
4. Never invent statistics.
5. Never invent quotations.
6. Never invent organizations.
7. Never invent dates.
8. Never use outside knowledge as evidence.
9. Treat search results as evidence that must be evaluated.
10. Prefer authoritative sources when they are supplied.
11. If sources conflict, acknowledge the conflict.
12. If the evidence is insufficient, use "Unclear".
13. Do not confuse "not proven" with "false".
14. Do not treat popularity as proof.
15. Do not blindly trust one source.
16. Keep confidence proportional to evidence quality.
17. Do not claim certainty when the supplied evidence does not justify it.

Allowed verdicts:

"Likely true"
"Likely false"
"Misleading"
"Unclear"

Allowed confidence:

"High"
"Medium"
"Low"

Return ONLY one JSON object.

The JSON must contain exactly these fields:

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
    "Useful evidence category one.",
    "Useful evidence category two."
  ]
}

Requirements:

- reasoning must contain 2 to 4 strings.
- evidenceToCheck must contain 2 to 4 strings.
- summary must be concise.
- context must be meaningful.
- Do not add extra fields.
- Do not use Markdown.
- Do not use code fences.
- Do not write anything outside the JSON object.

CLAIM:
${claim}

WEB EVIDENCE:
${buildEvidenceText(evidence)}
`.trim();
}

async function analyzeWithOpenRouter(
  claim: string,
  evidence: EvidenceSource[]
): Promise<Investigation> {
  const apiKey =
    process.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured."
    );
  }

  const prompt = buildPrompt(
    claim,
    evidence
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
          "HTTP-Referer":
            "https://truth-checker-eight.vercel.app",
          "X-Title": "Truth Checker",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content:
                "Return only the requested JSON object. Do not include Markdown or any text outside the JSON.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 700,
          stream: false,
        }),
        cache: "no-store",
        signal: timeoutSignal(),
      }
    );
  } catch (error) {
    console.error(
      "OPENROUTER_REQUEST_FAILED:",
      error
    );

    throw new Error(
      "The cloud AI could not be reached."
    );
  }

  const responseText =
    await response.text();

  if (!response.ok) {
    console.error(
      "OPENROUTER_ERROR:",
      response.status,
      responseText.slice(0, 5000)
    );

    throw new Error(
      `The cloud AI request failed (${response.status}).`
    );
  }

  let data: OpenRouterResponse;

  try {
    data = JSON.parse(
      responseText
    ) as OpenRouterResponse;
  } catch (error) {
    console.error(
      "OPENROUTER_INVALID_JSON:",
      error
    );

    console.error(
      "OPENROUTER_RAW_RESPONSE:",
      responseText.slice(0, 5000)
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

  const content =
    typeof data.choices?.[0]?.message?.content ===
    "string"
      ? data.choices[0].message.content.trim()
      : "";

  if (!content) {
    console.error(
      "OPENROUTER_EMPTY_CONTENT:",
      responseText.slice(0, 5000)
    );

    throw new Error(
      "The cloud AI returned no analysis."
    );
  }

  const cleaned = cleanJson(content);

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
      content.slice(0, 5000)
    );

    throw new Error(
      "The cloud AI returned invalid JSON."
    );
  }

  if (
    !isValidInvestigation(parsed)
  ) {
    console.error(
      "OPENROUTER_INVALID_RESULT:",
      JSON.stringify(parsed).slice(
        0,
        5000
      )
    );

    throw new Error(
      "The cloud AI returned an incomplete investigation."
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

    if (!process.env.TAVILY_API_KEY) {
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

    const investigation =
      await analyzeWithOpenRouter(
        claim,
        evidence
      );

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

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "The investigation could not be completed.",
      },
      { status: 500 }
    );
  }
}