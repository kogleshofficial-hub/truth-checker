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
    message?: unknown;
    code?: unknown;
  };
};

const TAVILY_URL = "https://api.tavily.com/search";
const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const OPENROUTER_MODEL = "openrouter/free";

const MAX_CLAIM_LENGTH = 500;
const MAX_SOURCES = 5;
const MAX_SNIPPET_LENGTH = 3000;

/*
 * Keep this timeout reasonably short.
 * Free models can occasionally be slow, so we allow
 * enough time without letting a Vercel request hang forever.
 */
const OPENROUTER_TIMEOUT_MS = 25000;
const TAVILY_TIMEOUT_MS = 20000;

/*
 * Small JSON response.
 *
 * The previous implementation requested too much output.
 * Some free models returned:
 *
 * finish_reason: "length"
 *
 * which means the JSON was cut off before completion.
 */
const MAX_OUTPUT_TOKENS = 450;

function timeoutSignal(
  milliseconds: number
): AbortSignal {
  return AbortSignal.timeout(milliseconds);
}

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function isValidInvestigation(
  value: unknown
): value is Investigation {
  if (!isObject(value)) {
    return false;
  }

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
    typeof value.verdict !== "string" ||
    !verdicts.includes(value.verdict)
  ) {
    return false;
  }

  if (
    typeof value.confidence !== "string" ||
    !confidenceLevels.includes(
      value.confidence
    )
  ) {
    return false;
  }

  if (
    typeof value.summary !== "string" ||
    value.summary.trim().length === 0
  ) {
    return false;
  }

  if (
    !Array.isArray(value.reasoning) ||
    value.reasoning.length < 2 ||
    value.reasoning.length > 4
  ) {
    return false;
  }

  if (
    !value.reasoning.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0
    )
  ) {
    return false;
  }

  if (
    typeof value.context !== "string" ||
    value.context.trim().length === 0
  ) {
    return false;
  }

  if (
    !Array.isArray(value.evidenceToCheck) ||
    value.evidenceToCheck.length < 2 ||
    value.evidenceToCheck.length > 4
  ) {
    return false;
  }

  if (
    !value.evidenceToCheck.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0
    )
  ) {
    return false;
  }

  return true;
}

/*
 * Extract a JSON object from model output.
 *
 * Free models sometimes put a small amount of text
 * around the JSON even when asked not to.
 */
function extractJson(
  text: string
): string {
  let cleaned = text.trim();

  cleaned = cleaned.replace(
    /^```json\s*/i,
    ""
  );

  cleaned = cleaned.replace(
    /^```\s*/i,
    ""
  );

  cleaned = cleaned.replace(
    /\s*```$/i,
    ""
  );

  const firstBrace =
    cleaned.indexOf("{");

  const lastBrace =
    cleaned.lastIndexOf("}");

  if (
    firstBrace !== -1 &&
    lastBrace !== -1 &&
    lastBrace > firstBrace
  ) {
    return cleaned.slice(
      firstBrace,
      lastBrace + 1
    );
  }

  return cleaned;
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
          max_results: MAX_SOURCES,
          include_answer: false,
          include_raw_content: false,
        }),

        cache: "no-store",

        signal: timeoutSignal(
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
      "The web evidence search could not be reached."
    );
  }

  const responseText =
    await response.text();

  if (!response.ok) {
    console.error(
      "TAVILY_ERROR:",
      response.status,
      responseText.slice(0, 3000)
    );

    throw new Error(
      `The web evidence search failed (${response.status}).`
    );
  }

  let data: TavilyResponse;

  try {
    data =
      JSON.parse(
        responseText
      ) as TavilyResponse;
  } catch (error) {
    console.error(
      "TAVILY_INVALID_JSON:",
      error
    );

    throw new Error(
      "Tavily returned an invalid response."
    );
  }

  const evidence =
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
            ? item.content.slice(
                0,
                MAX_SNIPPET_LENGTH
              )
            : "No summary available.",
      }))
      .slice(0, MAX_SOURCES);

  console.log(
    `TAVILY_SEARCH_COMPLETE: ${evidence.length} sources`
  );

  return evidence;
}

function buildPrompt(
  claim: string,
  evidence: EvidenceSource[]
): string {
  const evidenceText =
    evidence
      .map(
        (source, index) =>
          `SOURCE ${index + 1}
Title: ${source.title}
URL: ${source.url}
Content: ${source.snippet}`
      )
      .join(
        "\n\n---\n\n"
      );

  return `
You are Truth Checker's evidence-analysis engine.

Evaluate the CLAIM using ONLY the WEB EVIDENCE below.

Be conservative and evidence-first.

Never invent:
- sources
- URLs
- statistics
- studies
- dates
- quotations
- organizations
- facts not present in the evidence

If the evidence is insufficient, use "Unclear".

Allowed verdicts:
Likely true
Likely false
Misleading
Unclear

Allowed confidence:
High
Medium
Low

Return ONLY valid JSON.

Use exactly this structure:

{
  "verdict": "Unclear",
  "confidence": "Low",
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

Rules:
- reasoning: exactly 2 short items
- evidenceToCheck: exactly 2 short items
- summary: one short sentence
- context: one short sentence
- No Markdown
- No code fences
- No extra fields
- No explanation outside JSON

CLAIM:
${claim}

WEB EVIDENCE:
${evidenceText}
`.trim();
}

async function callOpenRouter(
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
    buildPrompt(
      claim,
      evidence
    );

  /*
   * We deliberately use the OpenRouter FREE router.
   *
   * OpenRouter chooses an available free model
   * instead of forcing Truth Checker onto one
   * specific model that may be rate-limited.
   */
  const requestBody = {
    model: OPENROUTER_MODEL,

    messages: [
      {
        role: "system",
        content:
          "Return only the requested JSON object. Keep every field short.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],

    /*
     * Structured outputs are requested when the
     * selected free model supports them.
     *
     * The parser below still validates the result,
     * because free-model availability can change.
     */
    response_format: {
      type: "json_schema",
      json_schema: {
        name:
          "truth_checker_result",

        strict: true,

        schema: {
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
              maxItems: 2,
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
              maxItems: 2,
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
        },
      },
    },

    temperature: 0,

    /*
     * This is intentionally small.
     * Your previous logs showed free models being
     * cut off with finish_reason = "length".
     */
    max_tokens:
      MAX_OUTPUT_TOKENS,

    stream: false,

    provider: {
      allow_fallbacks: true,
    },
  };

  console.log(
    "OPENROUTER_REQUEST_START"
  );

  let response: Response;

  try {
    response = await fetch(
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

        body: JSON.stringify(
          requestBody
        ),

        cache: "no-store",

        signal: timeoutSignal(
          OPENROUTER_TIMEOUT_MS
        ),
      }
    );
  } catch (error) {
    console.error(
      "OPENROUTER_REQUEST_FAILED:",
      error
    );

    if (
      error instanceof Error &&
      error.name ===
        "TimeoutError"
    ) {
      throw new Error(
        "The free AI model took too long to respond. Please try again."
      );
    }

    throw new Error(
      "The free AI service could not be reached."
    );
  }

  const raw =
    await response.text();

  if (!response.ok) {
    console.error(
      "OPENROUTER_ERROR:",
      response.status,
      raw.slice(0, 5000)
    );

    if (
      response.status === 429
    ) {
      throw new Error(
        "The free AI models are temporarily rate-limited. Please try again later."
      );
    }

    if (
      response.status === 408 ||
      response.status >= 500
    ) {
      throw new Error(
        "The free AI service is temporarily unavailable. Please try again."
      );
    }

    throw new Error(
      `OpenRouter request failed (${response.status}).`
    );
  }

  let data: OpenRouterResponse;

  try {
    data =
      JSON.parse(
        raw
      ) as OpenRouterResponse;
  } catch (error) {
    console.error(
      "OPENROUTER_INVALID_HTTP_JSON:",
      error
    );

    throw new Error(
      "OpenRouter returned an invalid response."
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
        : "OpenRouter returned an error."
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
      "The free AI model returned no result."
    );
  }

  const content =
    typeof choice.message
      ?.content === "string"
      ? choice.message.content.trim()
      : "";

  console.log(
    "OPENROUTER_RESPONSE:",
    JSON.stringify({
      model:
        data.model,
      finishReason:
        choice.finish_reason,
      contentLength:
        content.length,
    })
  );

  if (!content) {
    throw new Error(
      "The free AI model returned an empty result."
    );
  }

  /*
   * If the model was cut off, don't try to parse
   * obviously incomplete JSON.
   */
  if (
    choice.finish_reason ===
      "length"
  ) {
    console.error(
      "OPENROUTER_TRUNCATED_RESPONSE:",
      content.slice(0, 3000)
    );

    throw new Error(
      "The free AI model returned an incomplete result. Please try again."
    );
  }

  const jsonText =
    extractJson(content);

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
      content.slice(0, 5000)
    );

    throw new Error(
      "The free AI model returned invalid JSON. Please try again."
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
      "The free AI model returned an incomplete investigation. Please try again."
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
      isObject(body) &&
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
      await callOpenRouter(
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

    const isRateLimited =
      message.includes(
        "rate-limited"
      );

    const isTemporary =
      message.includes(
        "temporarily"
      ) ||
      message.includes(
        "try again"
      );

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: isRateLimited
          ? 429
          : isTemporary
            ? 502
            : 500,
      }
    );
  }
}