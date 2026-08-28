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
 * OpenRouter free router.
 *
 * The router selects an available free model automatically.
 *
 * IMPORTANT:
 * Free API access is rate-limited.
 * No provider can guarantee unlimited free API usage.
 */
const PRIMARY_MODEL = "openrouter/free";

const MAX_CLAIM_LENGTH = 500;
const MAX_EVIDENCE_SOURCES = 5;
const MAX_EVIDENCE_CHARS_PER_SOURCE = 3500;

const TAVILY_TIMEOUT_MS = 20000;
const OPENROUTER_TIMEOUT_MS = 30000;

function createTimeoutSignal(
  milliseconds: number
): AbortSignal {
  return AbortSignal.timeout(milliseconds);
}

/**
 * Extract the first complete JSON object from model output.
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
You are the analysis engine for a web evidence checker.

Your task is to evaluate the CLAIM using ONLY the supplied WEB EVIDENCE.

Be neutral, conservative, transparent, and evidence-based.

Do NOT invent:
- facts
- sources
- URLs
- statistics
- quotations
- dates
- information not present in the supplied evidence

Do NOT use outside knowledge as evidence.

Compare multiple sources when possible.

Pay attention to:
- source agreement
- source disagreement
- publication context
- dates
- wording
- whether a source actually supports the claim
- whether the claim contains missing context
- whether the evidence is insufficient

If reliable evidence supports the claim, use:
"Likely true"

If reliable evidence contradicts the claim, use:
"Likely false"

If the claim contains a mixture of truth and falsehood, missing context, misleading framing, or an important qualification, use:
"Misleading"

If the supplied evidence is insufficient to make a reasonable determination, use:
"Unclear"

"Not proven" does NOT automatically mean "Likely false".

Be conservative with confidence.

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
- every reasoning item must be a complete useful statement
- every evidenceToCheck item must identify something useful to verify
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
    `OPENROUTER_REQUEST_START: ${PRIMARY_MODEL}`
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
          model:
            PRIMARY_MODEL,

          messages: [
            {
              role: "system",

              content:
                "Return only the JSON object requested by the user. Do not include markdown, explanations outside the JSON, or additional text.",
            },

            {
              role: "user",

              content:
                prompt,
            },
          ],

          /*
           * Ask the selected free model for
           * structured JSON output.
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
      const timeoutError =
        new Error(
          "OpenRouter took too long to respond."
        );

      (
        timeoutError as Error & {
          status?: number;
        }
      ).status = 504;

      throw timeoutError;
    }

    throw new Error(
      "Could not reach OpenRouter."
    );
  }

  const rawText =
    await response.text();

  /*
   * Log the provider response for debugging.
   * Do not expose this information to the browser.
   */
  if (!response.ok) {
    console.error(
      "OPENROUTER_HTTP_ERROR:",
      JSON.stringify({
        model:
          PRIMARY_MODEL,

        status:
          response.status,

        body:
          rawText.slice(0, 5000),
      })
    );

    const error =
      new Error(
        `OpenRouter request failed (${response.status}).`
      );

    (
      error as Error & {
        status?: number;
      }
    ).status =
      response.status;

    throw error;
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

    throw new Error(
      "OpenRouter returned invalid response data."
    );
  }

  if (data.error) {
    const message =
      typeof data.error.message === "string"
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

    throw new Error(
      message
    );
  }

  const choice =
    data.choices?.[0];

  if (!choice) {
    console.error(
      "OPENROUTER_NO_CHOICE:",
      rawText.slice(0, 5000)
    );

    throw new Error(
      "OpenRouter returned no model response."
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
      model:
        data.model,

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

  const jsonText =
    extractJsonObject(
      content
    );

  if (!jsonText) {
    console.error(
      "OPENROUTER_NO_JSON:",
      content.slice(0, 5000)
    );

    throw new Error(
      "The AI returned no usable JSON."
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
      ).slice(
        0,
        5000
      )
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
      "TRUTH_CHECKER_START"
    );

    /*
     * Step 1:
     * Search the web for evidence.
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
     * Step 2:
     * Analyze the collected evidence.
     */
    console.log(
      "TRUTH_CHECKER_ANALYZING"
    );

    const investigation =
      await callOpenRouter(
        buildPrompt(
          claim,
          evidence
        )
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
      getErrorStatus(
        error
      );

    if (
      status === 429
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "The free AI service is temporarily rate-limited. Please try again shortly.",
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

          error:
            "The AI provider took too long to respond. Please try again shortly.",
        },

        {
          status: 504,
        }
      );
    }

    if (
      status === 404
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "The selected AI model is currently unavailable. Please try again later.",
        },

        {
          status: 502,
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