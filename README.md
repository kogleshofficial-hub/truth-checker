# Truth Checker 🔎

> **Evidence before certainty.**

Truth Checker is an evidence-first web application for investigating claims. Enter a statement, let the system gather relevant web evidence, and receive a transparent analysis with sources instead of an unsupported yes/no answer.

## 🚀 Live app

**https://truth-checker-app.vercel.app/**

## Why I built it

AI can sound confident even when the evidence is weak.

Truth Checker explores a different approach: retrieve evidence first, treat that evidence as untrusted data, analyze it, and show the sources so the user can inspect them.

## 🔎 How it works

```text
Claim
  ↓
Web evidence retrieval
  ↓
URL + source normalization
  ↓
Evidence limits
  ↓
AI analysis
  ↓
Structured validation
  ↓
Verdict + confidence + reasoning
  ↓
Sources the user can inspect
```

## Verdicts

The application uses four intentionally cautious outcomes:

- **Likely true** — available evidence generally supports the claim
- **Likely false** — available evidence generally contradicts the claim
- **Misleading** — important context is missing or distorted
- **Unclear** — available evidence is insufficient

Confidence is reported separately as **High**, **Medium**, or **Low**.

## 🛡️ Evidence-first design

A confident AI response is not the same thing as verified evidence.

The application validates claim input, keeps provider credentials server-side, validates investigation results, rejects malformed evidence URLs, limits source concentration, and exposes the underlying sources.

Retrieved web content is treated as **untrusted data**, not as instructions for the model.

## 🧱 Architecture

```text
User claim
    ↓
Next.js interface
    ↓
/api/check
    ├── Request validation
    ├── Two-angle web retrieval
    ├── URL/domain normalization
    ├── Source-quality signals
    └── Evidence limits
            ↓
        OpenRouter
            ↓
    Structured analysis
            ↓
      JSON extraction
            ↓
   Investigation validation
            ↓
     Confidence guard
            ↓
      Result + sources
```

## 🛠️ Tech stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Tavily for web evidence retrieval
- OpenRouter for AI-assisted analysis
- Vercel
- GitHub Actions

## 💻 Run locally

```bash
npm install
npm run dev
```

Create `.env.local` with the required server-side credentials:

```text
TAVILY_API_KEY=your_tavily_key
OPENROUTER_API_KEY=your_openrouter_key
```

Never commit API keys or other secrets.

For production validation:

```bash
npm run verify
```

This runs the project's lint, typecheck, and build checks.

## 🌐 Web identity

The application includes production metadata, canonical URLs, robots configuration, a sitemap, structured data, a web manifest, and social preview images.

## ⚠️ Important limitation

Truth Checker is an investigation aid, not a guarantee of truth. Evidence can be incomplete, outdated, biased, or wrong. Important claims should be checked against primary and authoritative sources.

## 🚧 Status

**Live MVP — actively evolving.**

The long-term goal is to make claim investigation clearer, more transparent, and easier to verify.

## 👨‍💻 Creator

Built independently by **Koglesh R. Murugan**, a 16-year-old developer from Malaysia.

> **Investigate before you believe.**

**Live:** https://truth-checker-app.vercel.app/
