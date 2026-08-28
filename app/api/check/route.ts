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

type OpenRouterMessage = {
  content?: unknown;
  reasoning?: unknown;
};

type OpenRouterResponse = {
  id?: unknown;
  model?: unknown;
  choices?: Array<{
    finish_reason?: unknown;
    message?: OpenRouterMessage;
  }>;
  error?: {
    code?: unknown;
    message?: unknown;
  };
};

const TAVILY_URL = "https://api.tavily.com/search";
const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const MODEL = "google/gemma-4-31b-it:free";

const MAX_CLAIM_LENGTH = 500;
const MAX_EVIDENCE_SOURCES = 5;
const MAX_EVIDENCE_CHARS_PER_SOURCE = 5000;
const REQUEST_TIMEOUT_MS = 30000;

function createTimeoutSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function cleanJson(text: string): string {
  let cleaned = text.trim();

  cleaned = cleaned.replace(
    /^```(?:json)?\s*/i,
    ""
  );

  cleaned = cleaned.replace(
    /\s*```$/i,
    ""
  );

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    cleaned = cleaned.slice(
      firstBrace,
      lastBrace + 1
    );
  }

  return cleaned.trim();
}

function isValidInvestigation(
  value: unknown
): value is Investigation {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const data =
    value as Record<string, unknown>;

  const validVerdicts = [
    "Likely true",
    "Likely false",
    "Misleading",
    "Unclear",
  ];

  const validConfidence = [
    "High",
    "Medium",
    "Low",
  ];

  return (
    typeof data.verdict === "string" &&
    validVerdicts.includes(
      data.verdict
    ) &&
    typeof data.confidence === "string" &&
    validConfidence.includes(
      data.confidence
    ) &&
    typeof data.summary === "string" &&
    data.summary.trim().length > 0 &&
    Array.isArray(data.reasoning) &&
    data.reasoning.length >= 2 &&
    data.reasoning.length <= 4 &&
    data.reasoning.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0
    ) &&
    typeof data.context === "string" &&
    data.context.trim().length > 0 &&
    Array.isArray(data.evidenceToCheck) &&
    data.evidenceToCheck.length >= 2 &&
    data.evidenceToCheck.length <= 4 &&
    data.evidenceToCheck.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0
    )
  );
}

async function searchEvidence(
  claim: string
): Promise<EvidenceSource[]> {
  const apiKey =
    process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error(
      "TAVILY_API_KEY is not configured."
    );
  }

  let response: Response;

  try {
    response = await fetch(
      TAVILY_URL,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: claim,
          search_depth: "advanced",
          topic: "general",
          max_results:
            MAX_EVIDENCE_SOURCES,
          include_answer: false,
          include_raw_content: false,
        }),
        cache: "no-store",
        signal: createTimeoutSignal(),
      }
    );
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
    const errorText =
      await response.text();

    console.error(
      "TAVILY_ERROR:",
      response.status,
      errorText.slice(0, 3000)
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
      "The evidence search returned an invalid response."
    );
  }

  const sources =
    (data.results ?? [])
      .filter(
        (item) =>
          typeof item.title ===
            "string" &&
          typeof item.url ===
            "string"
      )
      .map((item) => ({
        title:
          item.title as string,
        url:
          item.url as string,
        snippet:
          typeof item.content ===
          "string"
            ? item.content
            : "No summary available.",
      }))
      .slice(
        0,
        MAX_EVIDENCE_SOURCES
      );

  return sources;
}

function buildEvidenceText(
  evidence: EvidenceSource[]
): string {
  return evidence
    .map((source, index) => {
      const snippet =
        source.snippet.slice(
          0,
          MAX_EVIDENCE_CHARS_PER_SOURCE
        );

      return `SOURCE ${index + 1}

Title: ${source.title}

URL: ${source.url}

Content:
${snippet}`;
    })
    .join(
      "\n\n--------------------\n\n"
    );
}

function buildAnalysisPrompt(
  claim: string,
  evidence: EvidenceSource[]
): string {
  const evidenceText =
    buildEvidenceText(evidence);

  return `
You are the evidence-analysis engine for Truth Checker.

Investigate the user's claim using ONLY the supplied web evidence.

Be neutral, conservative, precise, and evidence-first.

IMPORTANT RULES:

1. Never invent sources.
2. Never invent URLs.
3. Never invent studies.
4. Never invent statistics.
5. Never invent quotations.
6. Never invent organizations.
7. Never invent dates.
8. Never use outside knowledge as evidence.
9. Search results are evidence to evaluate, not automatic truth.
10. Prefer authoritative sources when they are supplied.
11. If sources conflict, acknowledge the conflict.
12. If evidence is insufficient, use "Unclear".
13. Do not confuse "not proven" with "false".
14. Do not treat popularity as proof.
15. Do not blindly trust one source.
16. Keep confidence proportional to the quality and agreement of the evidence.

Allowed verdicts:

"Likely true"
"Likely false"
"Misleading"
"Unclear"

Allowed confidence:

"High"
"Medium"
"Low"

Return exactly this JSON structure:

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

- reasoning must contain 2 to 4 useful points.
- evidenceToCheck must contain 2 to 4 useful items.
- summary must be concise and understandable.
- context must be concise but meaningful.
- Do not mention evidence that was not supplied.
- Do not invent facts.
- Do not add extra JSON fields.
- Return JSON only.

CLAIM:
${claim}

WEB EVIDENCE:
${evidenceText}
`.trim();
}

async function analyzeWithOpenRouter(
  claim: string,
  evidence: EvidenceSource[]
): Promise<Investigation> {
  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured."
    );
  }

  const prompt =
    buildAnalysisPrompt(
      claim,
      evidence
    );

  const responseSchema = {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: [
          "Likely true",
          "Likely false",
          "Misleading",
          "Unclear",
        ],
      },
      confidence: {
        type: "string",
        enum: [
          "High",
          "Medium",
          "Low",
        ],
      },
      summary: {
        type: "string",
      },
      reasoning: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "string",
        },
      },
      context: {
        type: "string",
      },
      evidenceToCheck: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "string",
        },
      },
    },
    required: [
      "verdict",
      "confidence",
      "summary",
      "reasoning",
      "context",
      "evidenceToCheck",
    ],
    additionalProperties: false,
  };

  let response: Response;

  try {
    response = await fetch(
      OPENROUTER_URL,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type":
            "application/json",
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
                "You are Truth Checker's evidence-analysis engine. Return only the requested JSON object.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],

          response_format: {
            type: "json_schema",
            json_schema: {
              name:
                "truth_checker_investigation",
              strict: true,
              schema:
                responseSchema,
            },
          },

          reasoning: {
            effort: "none",
            exclude: true,
          },

          temperature: 0.1,
          max_tokens: 700,
          stream: false,

          provider: {
            allow_fallbacks: true,
          },
        }),

        cache: "no-store",
        signal: createTimeoutSignal(),
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

  const rawResponseText =
    await response.text();

  if (!response.ok) {
    console.error(
      "OPENROUTER_ERROR:",
      response.status,
      rawResponseText.slice(
        0,
        5000
      )
    );

    throw new Error(
      `The cloud AI request failed (${response.status}).`
    );
  }

  let data: OpenRouterResponse;

  try {
    data =
      JSON.parse(
        rawResponseText
      ) as OpenRouterResponse;
  } catch (error) {
    console.error(
      "OPENROUTER_INVALID_JSON_RESPONSE:",
      error
    );

    console.error(
      "OPENROUTER_RAW_HTTP_RESPONSE:",
      rawResponseText.slice(
        0,
        5000
      )
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
      typeof data.error.message ===
        "string"
        ? data.error.message
        : "The cloud AI returned an error."
    );
  }

  const choice =
    data.choices?.[0];

  if (!choice) {
    console.error(
      "OPENROUTER_NO_CHOICE:",
      JSON.stringify(
        data
      ).slice(0, 5000)
    );

    throw new Error(
      "The cloud AI returned no choice."
    );
  }

  const content =
    typeof choice.message
      ?.content === "string"
      ? choice.message.content.trim()
      : "";

  console.log(
    "OPENROUTER_RESULT:",
    JSON.stringify({
      model:
        data.model,
      finishReason:
        choice.finish_reason,
      hasContent:
        Boolean(content),
    })
  );

  if (!content) {
    console.error(
      "OPENROUTER_EMPTY_CONTENT:",
      JSON.stringify(
        data
      ).slice(0, 5000)
    );

    throw new Error(
      "The cloud AI returned no analysis."
    );
  }

  const cleaned =
    cleanJson(content);

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(cleaned);
  } catch (error) {
    console.error(
      "OPENROUTER_PARSE_ERROR:",
      error
    );

    console.error(
      "OPENROUTER_CONTENT:",
      content.slice(
        0,
        5000
      )
    );

    throw new Error(
      "The cloud AI returned invalid JSON."
    );
  }

  if (
    !isValidInvestigation(
      parsed
    )
  ) {
    console.error(
      "OPENROUTER_INVALID_RESULT:",
      JSON.stringify(
        parsed
      ).slice(0, 5000)
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
      typeof body.claim ===
        "string"
        ? body.claim.trim()
        : "";

    if (!claim) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Please enter a claim to investigate.",
        },
        {
          status: 400,
        }
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
        {
          status: 400,
        }
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
        {
          status: 500,
        }
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
        {
          status: 500,
        }
      );
    }

    console.log(
      "TRUTH_CHECKER_START:",
      claim
    );

    console.log(
      "TRUTH_CHECKER_SEARCHING:"
    );

    const evidence =
      await searchEvidence(
        claim
      );

    console.log(
      `TRUTH_CHECKER_EVIDENCE_COUNT: ${evidence.length}`
    );

    if (
      evidence.length === 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No web evidence was found for this claim.",
        },
        {
          status: 502,
        }
      );
    }

    console.log(
      "TRUTH_CHECKER_ANALYZING:"
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

    const message =
      error instanceof Error
        ? error.message
        : "The investigation could not be completed.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}