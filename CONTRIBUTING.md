# Contributing to accessibility-broadcast

Thanks for your interest. Accessibility work is the kind of thing that gets
better the more hands touch it — welcome.

## TL;DR

1. Open an issue first for anything non-trivial (new feature, API change,
   dependency add, refactor > ~100 lines). Fast-path for typos, docs, tests,
   and obvious bug fixes.
2. Fork, branch off `main`, make your change, add/adjust tests, run
   `npm test`, open a PR targeting `main`.
3. Small PRs get reviewed faster. Aim for one logical change per PR.

## Code of Conduct

By participating you agree to abide by the
[Code of Conduct](./CODE_OF_CONDUCT.md). Report issues per that document.

## Development setup

```bash
npm install
npm test
npm start
```

Node.js 20+ is required. Postgres is optional — the server runs against an
in-memory store by default. To enable persistence:

```bash
export ENABLE_POSTGRES=true
export DATABASE_URL=postgres://user:pass@localhost:5432/accessibility
npm start
```

`docker-compose up` brings up Postgres + the API together for local work.
**Do not ship the compose file's default credentials to production.**

## Project layout

```
src/
  server.js                    HTTP routing, auth, rate limit
  config/                      runtime config + accessibility catalog
  data/store.js                in-memory state + audit log
  services/
    streamingService.js        live ingest + segment pipeline
    streamingUiService.js      viewer/feedback HTML pages
    persistence/               Postgres snapshot persistence
    providers/                 model + translation provider interfaces
  utils/                       http, logger, validation
test/                          node --test suite
openapi/                       API contract (canonical source for SDKs)
sdk/js/                        published JS SDK
examples/                      runnable examples (model-gateway stub, etc.)
```

## What we look for in a PR

- **A clear "why".** One paragraph in the PR description. "Because fix" is
  not enough; say what was happening, what you expect, and why.
- **Tests.** If it's a bug fix, include a test that fails before your change
  and passes after. If it's a feature, cover the happy path and at least one
  error path.
- **OpenAPI parity.** If you change the HTTP surface, update `openapi/openapi.yaml`
  in the same PR.
- **No drive-by reformatting.** Keep the diff focused.
- **Accessibility check on UI changes.** Any change to `streamingUiService.js`
  or the overlay script should keep WCAG 2.2 AA intent: keyboard reachable,
  focus visible, contrast ≥ 4.5:1, respects `prefers-reduced-motion`.
- **Security mindfulness.** User-supplied data in templates must be escaped.
  New outbound HTTP calls must go through the provider interfaces (so they
  inherit timeout, allowlist, and observability).

## Commit messages

Conventional-ish, but we don't enforce a linter. A good message looks like:

```
Add per-key rate limiting alongside per-IP

The per-IP bucket doesn't stop a single leaked key from exhausting
DeepL quota. This adds a second bucket keyed on API-key-hash so a
leaked or buggy integration can be isolated without disabling the
whole deployment.

Closes #42
```

## Branching and releases

- `main` is always deployable in principle (tests green, no known
  regression). Feature work goes in PRs off `main`.
- Releases are tagged `v0.x.y` pre-1.0; `vMAJOR.MINOR.PATCH` after.
- Breaking API changes require a minor bump pre-1.0, a major post-1.0,
  and a note in `CHANGELOG.md`.

## Reporting bugs

Open an issue with:

- Version / commit SHA.
- How you started the service (compose? bare node? what env vars?).
- A minimal reproduction. Sanitize any real stream data.
- What you expected and what happened.

If it's a **security** issue, do not open a public issue — follow
[`SECURITY.md`](./SECURITY.md).

## Bigger contributions

For changes that touch the model-provider interface, persistence schema,
or the open-core seam interfaces (`UsageEventSink`, `TelemetrySink`,
`AuditLogSink`, `IdentityProvider`), open an issue tagged `rfc:` first so
we can agree on the shape before code review. These interfaces are
deliberately small; extending them affects both OSS and future commercial
implementations.

## Questions

Start a GitHub Discussion. "How do I embed this in my player?"-type
questions belong there; code issues belong in Issues.

Thanks again — we're glad you're here.
