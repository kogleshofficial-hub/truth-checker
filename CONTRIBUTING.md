# Contributing to Truth Checker

Thanks for helping improve Truth Checker.

## Before making a change

1. Read the README and understand the evidence-first design.
2. Keep API credentials and local environment files out of commits.
3. Prefer small, focused changes.
4. Preserve the distinction between evidence and AI-generated interpretation.

## Local checks

Run:

```bash
npm install
npm run lint
npm run build
```

For TypeScript validation, run:

```bash
npx tsc --noEmit
```

All checks should pass before opening a pull request.

## Evidence and security expectations

Changes involving evidence retrieval or AI analysis should preserve:

- Input validation
- Server-side secret handling
- URL and source validation
- Protection against treating retrieved web content as instructions
- Structured response validation
- Conservative confidence behavior
- Transparent source links for users

## Pull requests

Explain what changed, why it changed, and how it was tested. Avoid unrelated refactors in the same pull request.
