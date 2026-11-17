# Security policy

## Data classification

**Allowed in GitHub:** generic Python/TypeScript source, public product URLs, public pricing metadata, synthetic test fixtures and sanitized technical descriptions approved for external sharing.

**Forbidden in GitHub:** internal presentation decks, unpublished product plans, customer names or customer-derived resource inventories, true customer prices/discounts, personal data, diagrams or configurations from real customer environments, credentials and secrets.

## Guardrails

- `private/`, `confidential/` and other excluded folders should **live outside the repo**. `.gitignore` is a convenience, not a security control: files force-added or previously tracked can still be committed.
- Keep local customer workspaces in an access-controlled directory not accessible to cloud AI coding agents.
- Review `git status` and `git diff --cached` before every push.
- Never send real customer inventories to external AI or third-party APIs. Pricing APIs should receive only abstract SKU/region/usage parameters that are cleared for transmission.
- Treat API responses, pricing caches, logs and generated documents according to information-classification requirements.
- Prefer read-only cloud IAM access for demo APIs; do not grant write/delete permissions to the first iteration.
- Never claim an unverified price is an official published price.
