# Security Policy

## Scope

Truth Checker is a public web application that retrieves web evidence and uses an external AI provider to analyze that evidence.

Please do not include API keys, passwords, private tokens, personal data, or other sensitive information in a public issue.

## Reporting a vulnerability

If you discover a security vulnerability, please report it privately through GitHub's security reporting features for this repository rather than publishing the details in an issue.

When reporting a vulnerability, include:

- A clear description of the issue.
- The affected file, route, or component if known.
- Reproduction steps that do not expose secrets or private information.
- The potential impact.
- Any suggested mitigation, if you have one.

## Supported versions

The `master` branch is the actively maintained version of Truth Checker.

## Security principles

Truth Checker follows these principles:

- Provider credentials remain server-side.
- User claim input is validated and bounded.
- Retrieved web content is treated as untrusted data.
- Evidence URLs are validated before being returned to the interface.
- Investigation responses are not cached.
- Model output is structurally validated before being shown to users.
- Important conclusions should be checked against the underlying sources.
