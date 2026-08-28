# Truth Checker

> **Evidence before certainty.**

Truth Checker is an evidence-first web application for investigating claims. Enter a statement, let the system gather relevant web evidence, and receive a clear, understandable analysis instead of an unsupported yes/no answer.

## 🔎 What it does

1. **Accepts a claim** — the user enters a statement they want to investigate.
2. **Retrieves evidence** — relevant web sources are gathered for the claim.
3. **Analyzes the evidence** — the AI compares the supplied evidence conservatively rather than treating the model's prior knowledge as proof.
4. **Explains the conclusion** — the result includes a verdict, confidence level, reasoning, context, and evidence categories worth checking.
5. **Shows the sources** — users can inspect the underlying web evidence themselves.

## Verdicts

Truth Checker uses four intentionally cautious outcomes:

- **Likely true** — the available evidence generally supports the claim.
- **Likely false** — the available evidence generally contradicts the claim.
- **Misleading** — the claim contains an important missing, distorted, or over-simplified context.
- **Unclear** — the available evidence is insufficient to reach a responsible conclusion.

Confidence is reported separately as **High**, **Medium**, or **Low**.

## 🛡️ Evidence-first design

The application is designed around an important distinction:

> **A confident AI answer is not the same thing as verified evidence.**

The analysis prompt instructs the model to use the supplied web evidence, avoid inventing facts or sources, compare disagreements, and choose `Unclear` when the evidence is insufficient.

The application also validates the returned structure before sending the investigation to the interface.

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
    ├── Input validation
    │
    ├── Web evidence retrieval
    │
    └── Evidence normalization
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
      Result + sources
```

## Tech stack

- **Next.js 16**
- **React**
- **TypeScript**
- **Tailwind CSS**
- **Tavily** for web evidence retrieval
- **OpenRouter** for AI analysis
- **Vercel** for deployment
- **GitHub** for source control

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

For a production build:

```bash
npm run build
npm run start
```

## Project structure

```text
truth-checker/
├── app/
│   ├── api/
│   │   └── check/
│   │       └── route.ts
│   ├── icon.svg
│   ├── layout.tsx
│   ├── robots.ts
│   ├── sitemap.ts
│   ├── structured-data.tsx
│   └── page.tsx
├── public/
├── package.json
└── README.md
```

## Live

**https://truth-checker-app.vercel.app/**

## Author

**Koglesh R. Murugan**

Truth Checker is an independent project exploring how web evidence and AI can work together to make claim investigation clearer and more transparent.

> **Investigate before you believe.**
