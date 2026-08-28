# Truth Checker

> **Evidence before certainty.**

Truth Checker is an evidence-first web application for investigating claims. Enter a statement, let the system gather relevant web evidence, and receive a clear, understandable analysis instead of an unsupported yes/no answer.

## 🔎 What it does

1. **Accepts a claim** — the user enters a statement they want to investigate.
2. **Retrieves evidence** — two retrieval angles are used to reduce dependence on a single search ranking.
3. **Normalizes evidence** — duplicate URLs are removed, source domains are limited, malformed URLs are rejected, and simple source-quality signals help diversify the evidence set.
4. **Analyzes the evidence** — the AI is instructed to treat retrieved web content as untrusted data and to avoid using its own memory as evidence.
5. **Explains the conclusion** — the result includes a verdict, confidence level, reasoning, context, and evidence categories worth checking.
6. **Shows the sources** — users can inspect the underlying web evidence themselves.

## Verdicts

Truth Checker uses four intentionally cautious outcomes:

- **Likely true** — the available evidence generally supports the claim.
- **Likely false** — the available evidence generally contradicts the claim.
- **Misleading** — the claim contains an important missing, distorted, or over-simplified context.
- **Unclear** — the available evidence is insufficient to reach a responsible conclusion.

Confidence is reported separately as **High**, **Medium**, or **Low**. Confidence is guarded server-side so a small or overly concentrated evidence set cannot automatically produce a High-confidence result.

## 🛡️ Evidence-first and security design

A confident AI answer is not the same thing as verified evidence.

The API validates claim input, keeps provider credentials server-side, validates returned investigation data, rejects malformed evidence URLs, limits source concentration, and uses no-store responses for investigations.

Retrieved web content is explicitly treated as **untrusted data**. Source text must never be interpreted as instructions to the model.

The interface always exposes the source URLs so important claims can be checked independently.

## Architecture

```text
User claim
    │
    ▼
Next.js interface
    │
    ▼
/api/check
    │
    ├── Request validation
    │
    ├── Two-angle web retrieval
    │
    ├── URL/domain normalization
    │
    ├── Source-quality signals
    │
    └── Evidence limits
            │
            ▼
       OpenRouter
            │
            ▼
     Structured analysis
            │
            ▼
      JSON extraction
            │
            ▼
    Investigation validation
            │
            ▼
     Confidence guard
            │
            ▼
      Result + sources
```

## Tech stack

- **Next.js 16**
- **React 19**
- **TypeScript**
- **Tailwind CSS**
- **Tavily** for web evidence retrieval
- **OpenRouter** for AI-assisted analysis
- **Vercel** for deployment
- **GitHub Actions** for CI

## Environment variables

Create a local `.env.local` file with the required server-side credentials:

```text
TAVILY_API_KEY=your_tavily_key
OPENROUTER_API_KEY=your_openrouter_key
```

Never commit API keys or other secrets to GitHub.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

For a production validation:

```bash
npm run lint
npm run typecheck
npm run build
npm run start
```

## Continuous integration

Every push to `master` and every pull request targeting `master` runs:

```text
npm ci
npm run lint
npm run typecheck
npm run build
```

The workflow runs on Node.js 24 with current GitHub Actions checkout/setup-node releases.

## Reliability and UX

The application includes dedicated loading, error, and not-found states so navigation and unexpected rendering failures do not leave users at a blank or ambiguous screen.

The interface also supports reduced-motion preferences, visible keyboard focus states, responsive layouts, accessible error messaging, source inspection, and a safe fallback when validated AI analysis cannot be completed.

## SEO and web identity

The project includes:

- Canonical URL metadata
- Google indexing directives
- `robots.txt`
- `sitemap.xml`
- Structured data
- Web app manifest
- SVG application icon
- Favicon
- Generated Open Graph image
- Generated Twitter image
- Mobile/PWA viewport metadata
- HTTPS deployment

## Project structure

```text
truth-checker/
├── .github/workflows/ci.yml
├── app/
│   ├── api/check/route.ts
│   ├── error.tsx
│   ├── icon.svg
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   ├── loading.tsx
│   ├── manifest.ts
│   ├── not-found.tsx
│   ├── opengraph-image.tsx
│   ├── robots.ts
│   ├── sitemap.ts
│   ├── structured-data.tsx
│   ├── twitter-image.tsx
│   └── page.tsx
├── public/
├── package.json
├── package-lock.json
└── README.md
```

## Live application

**https://truth-checker-app.vercel.app/**

## Disclaimer

Truth Checker analyzes available evidence and does not replace primary sources, expert advice, or professional judgment. Evidence availability and source quality can vary, so important claims should be independently verified.

## Author

**Koglesh R. Murugan**

Truth Checker is an independent project exploring how web evidence and AI can work together to make claim investigation clearer and more transparent.

> **Investigate before you believe.**
