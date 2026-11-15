# Security Policy

## Supported Versions

accessibility-broadcast is pre-1.0. The `main` branch is the only supported
version today. Once 1.0 ships, we will document a rolling support window
(latest minor + previous minor receive security fixes).

| Version | Supported          |
| ------- | ------------------ |
| `main`  | :white_check_mark: |
| < 1.0   | :x: (pre-release)  |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately via one of the following channels:

1. **GitHub private vulnerability reporting** — preferred. Open an advisory at
   https://github.com/dedmonwalkin/accessibility-broadcast/security/advisories/new
2. **Email** — `security@` the domain used by the maintainer's GitHub-profile
   website, or direct message the maintainer on GitHub for a private channel if
   no such address is published.

Please include:

- A description of the issue and the impact you believe it has.
- Reproduction steps (proof-of-concept code is welcome but not required).
- The commit SHA or release you tested.
- Whether you intend to publish a write-up and a timeline, so we can
  coordinate disclosure.

### What to expect

- **Acknowledgement** within 72 hours.
- **Triage + severity** (CVSS 3.1) within 7 days.
- **Fix or mitigation plan** within 30 days for High/Critical.
- **Public disclosure** coordinated with the reporter, typically after a fix
  is released. We will credit reporters by name/handle unless asked not to.

We will not pursue legal action against good-faith researchers who follow this
policy, stay within the scope below, and avoid privacy or service-availability
harm to users of deployed instances.

### In scope

- The code in this repository.
- Official container images published from this repository.
- The default configuration and example deployment manifests.

### Out of scope

- Self-hosted deployments operated by third parties (report to the operator).
- Denial-of-service via provider quota exhaustion of upstream services
  (DeepL, LibreTranslate, your Whisper endpoint) — that's a cost boundary
  the operator must size, not a library vulnerability. **Exception:** if the
  code enables cheap amplification by an unauthenticated attacker, that is
  in scope.
- Vulnerabilities in dependencies that have no upstream fix; please report
  those to the dependency maintainer and CC us.

## Hardening guidance for operators

See `docs/security-hardening.md` (coming soon). Minimum checklist today:

- Set `API_KEYS` to a non-empty list of strong random values (≥ 32 bytes).
- Never set `AUTH_DISABLED=true` in production.
- Run the container as a non-root user; pin the base image by digest.
- Terminate TLS in front of the service; Postgres connections should use TLS.
- Set `TRUSTED_PROXIES` so rate limiting parses `X-Forwarded-For` correctly.
- Configure a model-provider allowlist (`MODEL_HTTP_BASE_URL`,
  `TRANSLATION_HTTP_BASE_URL`) to an endpoint you control. Do not point these
  at untrusted third parties without reviewing egress policy.

## Bug bounty

There is no paid bounty program today. We publicly credit reporters in release
notes and in `SECURITY_HALL_OF_FAME.md` once that file exists. If/when a
commercial edition launches, a funded bounty is on the roadmap.
