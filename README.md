# Truth Checker 🔎

> **Evidence before certainty.**

Truth Checker is an evidence-first web application for investigating claims. Instead of asking an AI model to answer from memory, it retrieves relevant web evidence, treats that material as untrusted data, and produces a cautious, structured analysis with sources a person can inspect.

## Live app

**https://truth-checker-app.vercel.app/**

## Why I built it

AI systems can sound confident even when the evidence behind an answer is weak. Truth Checker explores a different workflow:

**Claim → web evidence → source normalization → evidence limits → AI analysis → validation → verdict + confidence → inspectable sources**

The goal is not to replace human judgment. It is to make the path from a claim to the evidence behind an explanation easier to inspect.

## What it returns

Every investigation uses four deliberately cautious verdicts:

- **Likely true** — available evidence generally supports the claim.
- **Likely false** — available evidence generally contradicts the claim.
- **Misleading** — the statement needs important context or is materially incomplete.
- **Unclear** — the available evidence is insufficient or genuinely conflicting.

Confidence is reported separately as **High, Medium, or Low** so a verdict is not presented as absolute certainty.

## Evidence-first safeguards

- Web content is treated as **untrusted data**, not model instructions.
- Source URLs are normalized and validated before being shown.
- Source concentration is limited so one domain cannot dominate the evidence set.
- The analysis prompt explicitly rejects invented sources, quotations, statistics, and facts.
- Confidence is automatically reduced when the evidence set is too small or lacks source diversity.
- Malformed model output is rejected instead of being rendered as a result.
- Important claims are explicitly directed back to primary and authoritative sources.

## Tech stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Tavily for web evidence retrieval
- OpenRouter free-model routing for AI-assisted analysis
- Vercel
- GitHub Actions

## Run locally

```bash
npm install
npm run dev
```

Create `.env.local`:

```env
TAVILY_API_KEY=your_tavily_key
OPENROUTER_API_KEY=your_openrouter_key
```

Never commit API keys or other secrets.

For production validation:

```bash
npm run verify
```

This runs the project's lint, typecheck, and build checks.

## Important limitation

Truth Checker is an **investigation aid, not a guarantee of truth**. Web evidence can be incomplete, outdated, biased, or wrong. The app is designed to expose that uncertainty rather than hide it.

## Creator

Built independently by **Koglesh R. Murugan**, a 16-year-old student developer from Malaysia.

> **Investigate before you believe.**
