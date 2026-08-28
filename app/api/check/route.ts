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

const TAVILY_URL = "https://api.tavily.com/search";
const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

/*
 * Primary model:
 * OpenAI gpt-oss-20b is currently available as a free OpenRouter model
 * and supports structured outputs.
 *
 * Fallback:
 * OpenRouter's free router can select another currently available
 * free model.
 */
const PRIMARY_MODEL = "openai/gpt-oss-20b:free";
const FALLBACK_MODEL = "openrouter/free";

const MAX_CLAIM_LENGTH = 500;
const MAX_EVIDENCE_SOURCES = 5;
const MAX_EVIDENCE_CHARS_PER_SOURCE = 3500;

const TAVILY_TIMEOUT_MS = 20000;
const OPENROUTER_TIMEOUT_MS = 25000;

function createTimeoutSignal(
  milliseconds: number
): AbortSignal {
  return AbortSignal.timeout(milliseconds);
}

/**
 * Attempts to find a JSON object inside arbitrary model output.
 *
 * This is intentionally defensive because free models may sometimes
 * return markdown, explanations, or other text around the JSON.
 */
function extractJsonObject(
  text: string
): string | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");

  if (firstBrace === -1) {
    return null;
  }

  let depth = 0;
  let insideString = false;
  let escaped = false;

  for (
    let index = firstBrace;
    index < cleaned.length;
    index++
  ) {
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

    if (insideString) {
      continue;
    }

    if (character === "{") {
      depth++;
    }

    if (character === "}") {
      depth--;

      if (depth === 0) {
        return cleaned.slice(
          firstBrace,
          index + 1
        );
      }
    }
  }

  return null;
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
    !confidenceLevels.includes(
      data.confidence
    )
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
  const apiKey =
    process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error(
      "TAVILY_API_KEY is not configured."
    );
  }

  console.log(
    "TAVILY_SEARCH_START"
  );

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
        signal:
          createTimeoutSignal(
            TAVILY_TIMEOUT_MS
          ),
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
        title:
          item.title as string,
        url:
          item.url as string,
        snippet:
          typeof item.content === "string"
            ? item.content
            : "No summary available.",
      }))
      .slice(
        0,
        MAX_EVIDENCE_SOURCES
      );

  console.log(
    `TAVILY_SEARCH_COMPLETE: ${sources.length} sources`
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

      return [
        `SOURCE ${index + 1}`,
        `Title: ${source.title}`,
        `URL: ${source.url}`,
        `Content: ${snippet}`,
      ].join("\n");
    })
    .join(
      "\n\n--------------------\n\n"
    );
}

function buildPrompt(
  claim: string,
  evidence: EvidenceSource[]
): string {
  return `
You are the AI analysis engine for a web evidence checker.

Your ONLY job is to analyze the supplied claim using ONLY the supplied web evidence.

Do not use outside knowledge as evidence.

Rules:

- Be neutral.
- Be conservative.
- Do not invent facts.
- Do not invent sources.
- Do not invent URLs.
- Do not invent statistics.
- Do not invent quotations.
- Do not invent dates.
- Do not assume a source is correct simply because it appears first.
- Compare the supplied sources.
- If sources disagree, explain the disagreement.
- If evidence is insufficient, use "Unclear".
- "Not proven" does NOT automatically mean "Likely false".

Allowed verdict values:

Likely true
Likely false
Misleading
Unclear

Allowed confidence values:

High
Medium
Low

Return ONLY ONE JSON OBJECT.

Do NOT write:
- "User Safety: safe"
- an introduction
- markdown
- code fences
- explanations before the JSON
- explanations after the JSON
- extra fields

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

- reasoning: 2 to 4 items
- evidenceToCheck: 2 to 4 items
- summary: concise
- context: concise
- JSON only

CLAIM:
${claim}

WEB EVIDENCE:
${buildEvidenceText(evidence)}
`.trim();
}

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
      items: {
        type: "string",
      },
      minItems: 2,
      maxItems: 4,
    },
    context: {
      type: "string",
    },
    evidenceToCheck: {
      type: "array",
      items: {
        type: "string",
      },
      minItems: 2,
      maxItems: 4,
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

async function callOpenRouter(
  model: string,
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
    `OPENROUTER_REQUEST: ${model}`
  );

  const response =
    await fetch(
      OPENROUTER_URL,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${apiKey}`,
          "Content-Type":
            "application/json",
          "HTTP-Referer":
            "https://truth-checker-eight.vercel.app",
          "X-Title":
            "Truth Checker",
        },
        body: JSON.stringify({
          model,

          messages: [
            {
              role: "system",
              content:
                "Return only the requested JSON object. Never output safety classifications, commentary, markdown, or any text outside the JSON object.",
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

          temperature: 0,

          /*
           * Keep the response deliberately small.
           * Free models are more reliable when they have
           * a simple, bounded output.
           */
          max_tokens: 500,

          stream: false,

          /*
           * Do not request reasoning.
           * We need only the final structured answer.
           */
          reasoning: {
            effort: "none",
            exclude: true,
          },
        }),

        cache: "no-store",

        signal:
          createTimeoutSignal(
            OPENROUTER_TIMEOUT_MS
          ),
      }
    );

  const rawText =
    await response.text();

  if (!response.ok) {
    console.error(
      `OPENROUTER_HTTP_ERROR: ${model} ${response.status}`,
      rawText.slice(0, 3000)
    );

    const error =
      new Error(
        `OpenRouter request failed (${response.status}).`
      );

    (
      error as Error & {
        status?: number;
      }
    ).status = response.status;

    throw error;
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

    throw new Error(
      "OpenRouter returned invalid response data."
    );
  }

  if (data.error) {
    const message =
      typeof data.error.message ===
      "string"
        ? data.error.message
        : "OpenRouter returned an error.";

    console.error(
      "OPENROUTER_API_ERROR:",
      message
    );

    throw new Error(message);
  }

  const choice =
    data.choices?.[0];

  if (!choice) {
    throw new Error(
      "OpenRouter returned no model response."
    );
  }

  const content =
    typeof choice.message
      ?.content === "string"
      ? choice.message.content.trim()
      : "";

  console.log(
    "OPENROUTER_SUCCESS:",
    JSON.stringify({
      model: data.model,
      finishReason:
        choice.finish_reason,
      hasContent:
        Boolean(content),
    })
  );

  if (!content) {
    throw new Error(
      "OpenRouter returned empty content."
    );
  }

  /*
   * IMPORTANT:
   *
   * Even when response_format is requested,
   * free models can occasionally return malformed
   * or decorated output.
   *
   * We therefore extract the JSON ourselves.
   */
  const jsonText =
    extractJsonObject(content);

  if (!jsonText) {
    console.error(
      "OPENROUTER_NO_JSON_OBJECT:",
      content.slice(0, 4000)
    );

    throw new Error(
      "The AI returned no usable JSON."
    );
  }

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(jsonText);
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
      "The AI returned invalid JSON."
    );
  }

  if (
    !isValidInvestigation(
      parsed
    )
  ) {
    console.error(
      "OPENROUTER_INVALID_INVESTIGATION:",
      JSON.stringify(
        parsed
      ).slice(0, 4000)
    );

    throw new Error(
      "The AI returned an incomplete investigation."
    );
  }

  return parsed;
}

function getErrorStatus(
  error: unknown
): number | undefined {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (
      error as {
        status?: unknown;
      }
    ).status === "number"
  ) {
    return (
      error as {
        status: number;
      }
    ).status;
  }

  return undefined;
}

async function analyzeWithOpenRouter(
  claim: string,
  evidence: EvidenceSource[]
): Promise<Investigation> {
  const prompt =
    buildPrompt(
      claim,
      evidence
    );

  /*
   * Try the predictable free model first.
   */
  try {
    return await callOpenRouter(
      PRIMARY_MODEL,
      prompt
    );
  } catch (error) {
    const status =
      getErrorStatus(error);

    console.error(
      "OPENROUTER_PRIMARY_FAILED:",
      status,
      error
    );

    /*
     * Only fall back for temporary/provider problems.
     *
     * We do not want to hide configuration/authentication
     * problems by repeatedly retrying them.
     */
    const shouldFallback =
      status === 429 ||
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504 ||
      error instanceof Error &&
        (
          error.name ===
            "TimeoutError" ||
          error.message.includes(
            "temporarily"
          )
        );

    if (!shouldFallback) {
      throw error;
    }
  }

  /*
   * Fallback to OpenRouter's free router.
   *
   * This may choose different free models depending on
   * current availability.
   */
  try {
    return await callOpenRouter(
      FALLBACK_MODEL,
      prompt
    );
  } catch (error) {
    console.error(
      "OPENROUTER_FALLBACK_FAILED:",
      error
    );

    const status =
      getErrorStatus(error);

    if (
      status === 429
    ) {
      const rateLimitError =
        new Error(
          "The free OpenRouter models are temporarily rate-limited. Please try again shortly."
        );

      (
        rateLimitError as Error & {
          status?: number;
        }
      ).status = 429;

      throw rateLimitError;
    }

    if (
      error instanceof Error &&
      error.name === "TimeoutError"
    ) {
      const timeoutError =
        new Error(
          "The free AI provider took too long to respond. Please try again shortly."
        );

      (
        timeoutError as Error & {
          status?: number;
        }
      ).status = 504;

      throw timeoutError;
    }

    throw error;
  }
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
      typeof (
        body as {
          claim?: unknown;
        }
      ).claim === "string"
        ? (
            body as {
              claim: string;
            }
          ).claim.trim()
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
      "TRUTH_CHECKER_SEARCHING"
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

    const message =
      error instanceof Error
        ? error.message
        : "The investigation could not be completed.";

    const status =
      getErrorStatus(error);

    if (
      status === 429
    ) {
      return NextResponse.json(
        {
          success: false,
          error: message,
        },
        {
          status: 429,
        }
      );
    }

    if (
      status === 504
    ) {
      return NextResponse.json(
        {
          success: false,
          error: message,
        },
        {
          status: 504,
        }
      );
    }

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