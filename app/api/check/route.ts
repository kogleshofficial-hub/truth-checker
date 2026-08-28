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
 * IMPORTANT:
 *
 * Do NOT hard-code a specific :free model here.
 *
 * openrouter/free dynamically chooses from the models
 * currently available in OpenRouter's free pool.
 *
 * This avoids breaking the application whenever one
 * specific free model is removed, renamed, or becomes
 * temporarily unavailable.
 */
const FREE_MODEL = "openrouter/free";

const MAX_CLAIM_LENGTH = 500;

const MAX_EVIDENCE_SOURCES = 5;

const MAX_EVIDENCE_CHARS_PER_SOURCE = 3500;

const TAVILY_TIMEOUT_MS = 20000;

const OPENROUTER_TIMEOUT_MS = 30000;

/*
 * AbortSignal.timeout() is available in the
 * Next.js/Vercel server runtime.
 */
function createTimeoutSignal(
  milliseconds: number
): AbortSignal {
  return AbortSignal.timeout(milliseconds);
}

/**
 * Extract the first complete JSON object from model output.
 *
 * This protects the application if a model returns:
 *
 * ```json
 * { ... }
 * ```
 *
 * or includes a small amount of text around the JSON.
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

/**
 * Validate the structure returned by the AI.
 */
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

  if (
    typeof data.verdict !== "string" ||
    !validVerdicts.includes(
      data.verdict
    )
  ) {
    return false;
  }

  if (
    typeof data.confidence !== "string" ||
    !validConfidence.includes(
      data.confidence
    )
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

/**
 * Search the web using Tavily.
 */
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

/**
 * Convert evidence into a compact prompt section.
 */
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

/**
 * Build the investigation prompt.
 */
function buildPrompt(
  claim: string,
  evidence: EvidenceSource[]
): string {
  return `
You are the analysis engine for a web evidence checker.

Analyze the CLAIM using ONLY the supplied WEB EVIDENCE.

Be neutral, conservative, and evidence-based.

Do not invent:
- facts
- sources
- URLs
- statistics
- quotations
- dates

Do not use outside knowledge as evidence.

Compare the supplied sources.

If sources agree, explain the agreement.

If sources disagree, explain the disagreement.

If the evidence is insufficient, use "Unclear".

"Not proven" does not automatically mean "Likely false".

Allowed verdicts:
- Likely true
- Likely false
- Misleading
- Unclear

Allowed confidence:
- High
- Medium
- Low

Return ONLY valid JSON.

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
    "Evidence category one.",
    "Evidence category two."
  ]
}

Requirements:

- reasoning must contain 2 to 4 items
- evidenceToCheck must contain 2 to 4 items
- summary must be concise
- context must be concise
- no markdown
- no code fences
- no additional fields

CLAIM:
${claim}

WEB EVIDENCE:
${buildEvidenceText(evidence)}
`.trim();
}

/**
 * JSON Schema used for structured output.
 */
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

/**
 * Get a status code from an Error object.
 */
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

/**
 * Attach an HTTP status to an Error.
 */
function createHttpError(
  message: string,
  status: number
): Error & { status: number } {
  const error =
    new Error(message) as Error & {
      status: number;
    };

  error.status = status;

  return error;
}

/**
 * Call OpenRouter.
 *
 * IMPORTANT:
 * We use openrouter/free instead of a hard-coded
 * model such as openai/gpt-oss-20b:free.
 *
 * OpenRouter's free router chooses from the
 * currently available free models.
 */
async function callOpenRouter(
  prompt: string
): Promise<Investigation> {
  const apiKey =
    process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw createHttpError(
      "OpenRouter API key is not configured.",
      500
    );
  }

  console.log(
    `OPENROUTER_REQUEST_START: ${FREE_MODEL}`
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
            "https://truth-checker-app.vercel.app",

          "X-Title":
            "Truth Checker",
        },

        body: JSON.stringify({
          model: FREE_MODEL,

          messages: [
            {
              role: "system",

              content:
                "Return only the JSON object requested by the user. Do not include markdown or additional text.",
            },

            {
              role: "user",

              content: prompt,
            },
          ],

          /*
           * Ask OpenRouter for structured JSON.
           *
           * The Free Models Router can select free
           * models that support the required capability.
           */
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

          max_tokens: 700,

          stream: false,
        }),

        cache: "no-store",

        signal:
          createTimeoutSignal(
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
      throw createHttpError(
        "The AI provider took too long to respond. Please try again shortly.",
        504
      );
    }

    throw createHttpError(
      "Could not reach OpenRouter.",
      502
    );
  }

  const rawText =
    await response.text();

  /*
   * Always keep the actual provider response
   * in the server logs for debugging.
   */
  if (!response.ok) {
    console.error(
      "OPENROUTER_HTTP_ERROR:",
      JSON.stringify({
        model: FREE_MODEL,

        status:
          response.status,

        body:
          rawText.slice(
            0,
            5000
          ),
      })
    );

    let providerMessage =
      "";

    try {
      const providerData =
        JSON.parse(
          rawText
        ) as OpenRouterResponse;

      if (
        providerData.error &&
        typeof providerData.error.message ===
          "string"
      ) {
        providerMessage =
          providerData.error.message;
      }
    } catch {
      /*
       * Provider returned something other
       * than JSON. Keep the raw status.
       */
    }

    /*
     * Convert common provider failures into
     * useful application errors.
     */
    if (
      response.status === 429
    ) {
      throw createHttpError(
        "The free AI models are temporarily rate-limited. Please try again shortly.",
        429
      );
    }

    if (
      response.status === 404
    ) {
      throw createHttpError(
        providerMessage ||
          "The OpenRouter free model router is temporarily unavailable.",
        503
      );
    }

    if (
      response.status === 408 ||
      response.status === 500 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {
      throw createHttpError(
        "The AI provider is temporarily unavailable. Please try again shortly.",
        503
      );
    }

    throw createHttpError(
      providerMessage ||
        `OpenRouter request failed (${response.status}).`,
      response.status
    );
  }

  let data: OpenRouterResponse;

  try {
    data =
      JSON.parse(
        rawText
      ) as OpenRouterResponse;
  } catch (error) {
    console.error(
      "OPENROUTER_INVALID_JSON:",
      rawText.slice(0, 5000)
    );

    throw createHttpError(
      "OpenRouter returned invalid response data.",
      502
    );
  }

  /*
   * OpenRouter can return an API-level error
   * inside an otherwise successful HTTP response.
   */
  if (data.error) {
    const message =
      typeof data.error.message ===
      "string"
        ? data.error.message
        : "OpenRouter returned an API error.";

    console.error(
      "OPENROUTER_API_ERROR:",
      JSON.stringify({
        code:
          data.error.code,

        message,
      })
    );

    throw createHttpError(
      message,
      502
    );
  }

  const choice =
    data.choices?.[0];

  if (!choice) {
    console.error(
      "OPENROUTER_NO_CHOICE:",
      rawText.slice(0, 5000)
    );

    throw createHttpError(
      "OpenRouter returned no model response.",
      502
    );
  }

  const content =
    typeof choice.message?.content ===
    "string"
      ? choice.message.content.trim()
      : "";

  console.log(
    "OPENROUTER_RESPONSE:",
    JSON.stringify({
      requestedModel:
        FREE_MODEL,

      actualModel:
        data.model,

      finishReason:
        choice.finish_reason,

      hasContent:
        Boolean(content),
    })
  );

  if (!content) {
    throw createHttpError(
      "OpenRouter returned empty content.",
      502
    );
  }

  const jsonText =
    extractJsonObject(
      content
    );

  if (!jsonText) {
    console.error(
      "OPENROUTER_NO_JSON:",
      content.slice(0, 5000)
    );

    throw createHttpError(
      "The AI returned no usable JSON.",
      502
    );
  }

  let parsed: unknown;

  try {
    parsed =
      JSON.parse(
        jsonText
      );
  } catch (error) {
    console.error(
      "OPENROUTER_JSON_PARSE_ERROR:",
      error
    );

    console.error(
      "OPENROUTER_CONTENT:",
      content.slice(0, 5000)
    );

    throw createHttpError(
      "The AI returned invalid JSON.",
      502
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
      ).slice(
        0,
        5000
      )
    );

    throw createHttpError(
      "The AI returned an incomplete investigation.",
      502
    );
  }

  return parsed;
}

/**
 * Analyze evidence with OpenRouter.
 *
 * There is deliberately NO hard-coded model fallback here.
 *
 * openrouter/free is itself a dynamic free-model router.
 *
 * If OpenRouter is temporarily rate-limited or unavailable,
 * we return a useful error instead of repeatedly hitting
 * dead model slugs.
 */
async function analyzeWithOpenRouter(
  claim: string,
  evidence: EvidenceSource[]
): Promise<Investigation> {
  const prompt =
    buildPrompt(
      claim,
      evidence
    );

  try {
    return await callOpenRouter(
      prompt
    );
  } catch (error) {
    const status =
      getErrorStatus(
        error
      );

    console.error(
      "OPENROUTER_ANALYSIS_FAILED:",
      JSON.stringify({
        status,

        message:
          error instanceof Error
            ? error.message
            : String(error),
      })
    );

    throw error;
  }
}

/**
 * POST /api/check
 */
export async function POST(
  request: Request
) {
  try {
    /*
     * Parse request body.
     */
    const body: unknown =
      await request.json();

    /*
     * Extract claim safely.
     */
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

    /*
     * Validate claim.
     */
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

    /*
     * Check required environment variables.
     */
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
      "TRUTH_CHECKER_START"
    );

    /*
     * STEP 1:
     * Search the web.
     */
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

    /*
     * STEP 2:
     * Analyze the collected evidence.
     */
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

    /*
     * STEP 3:
     * Return the complete investigation.
     */
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
      getErrorStatus(
        error
      );

    /*
     * Rate limit.
     */
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

    /*
     * Timeout.
     */
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

    /*
     * Temporary provider failure.
     */
    if (
      status === 502 ||
      status === 503
    ) {
      return NextResponse.json(
        {
          success: false,

          error: message,
        },
        {
          status,
        }
      );
    }

    /*
     * Validation / application errors.
     */
    return NextResponse.json(
      {
        success: false,

        error: message,
      },
      {
        status:
          status && status >= 400
            ? status
            : 500,
      }
    );
  }
}