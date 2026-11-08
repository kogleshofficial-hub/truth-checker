# Truth Checker 🔎

> **Evidence before certainty.**

Truth Checker is an evidence-first web application for investigating claims. It searches public Wikipedia reference pages, treats article excerpts as untrusted evidence, and runs a compact language model in the visitor's browser to produce a cautious, structured analysis.

## Live app

**https://truth-checker-app.vercel.app/**

## How it works

```text
Claim
  ↓
Wikipedia reference search
  ↓
Article excerpts shown to the visitor
  ↓
Local LFM2.5-350M model
  ↓
Output validation and confidence guard
  ↓
Cautious verdict + visible references
```

This free mode is intentionally narrower than a general web search engine. The claim text is sent to Wikipedia's public search API to find reference pages. AI inference itself runs locally in the browser; it is not sent to OpenRouter or another hosted AI provider.

## What it returns

Every investigation uses four cautious verdicts:

- **Likely true** — the available reference excerpts generally support the claim.
- **Likely false** — the available reference excerpts generally contradict the claim.
- **Misleading** — the statement needs important context or is materially incomplete.
- **Unclear** — the available reference excerpts are insufficient or do not address the claim.

Confidence is reported separately. This mode never returns High confidence, because it uses a compact model and a limited reference set.

## Evidence and safety limits

- Searches up to four relevant Wikipedia pages for a claim.
- Displays the linked article pages and excerpts so a person can inspect them.
- Treats article text as untrusted data, never as model instructions.
- Does not invent URLs, quotations, dates, or statistics.
- Returns Unclear when no useful reference pages are found or the model output fails validation.
- Does not treat the absence of a Wikipedia result as evidence that a claim is false.
- Is not a comprehensive live-web fact checker. For important or current claims, verify primary and authoritative sources yourself.

## AI runtime and cost

The app uses [Transformers.js](https://huggingface.co/docs/transformers.js) with the LFM2.5-350M ONNX model from Liquid AI.

- Inference happens on the visitor's device.
- WebGPU is used when available; CPU/WASM is the fallback.
- The first use downloads approximately 300 MB of model files from Hugging Face.
- Model files are cached in the browser where supported. Clearing browser storage or cache eviction may require another download.
- No AI API key or paid inference account is required.

## Tech stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Wikipedia Action API
- Hugging Face Transformers.js
- LFM2.5-350M by Liquid AI
- ONNX Runtime
- Vercel
- GitHub Actions

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. No `.env.local` file, Tavily key, or OpenRouter key is required.

For verification:

```bash
npm run verify
```

## Model license

LFM2.5-350M is distributed under the [LFM Open License v1.0](https://www.liquid.ai/lfm-license). The license permits commercial use subject to its $10 million annual-revenue threshold. Keep the license terms and attribution in place.

## Important limitation

Truth Checker is an **investigation aid, not a guarantee of truth**. Wikipedia may be incomplete or outdated, and a small local model can misunderstand evidence. Important claims should be checked against primary documents, official datasets, and authoritative independent sources.

## Creator

Built independently by **Koglesh R. Murugan**, a student developer from Malaysia.

> **Investigate before you believe.**
