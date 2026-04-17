# Roadmap

The roadmap reflects what we're working toward, not a contract. Dates are
approximate; scope may flex.

## v0.2 — Launch hardening (Q2 2026)

Goal: the repo is safe to publish publicly and a developer can go from
`git clone` to a running demo in under 10 minutes.

- [x] Apache-2.0 LICENSE + governance/security docs
- [x] Open-core seam interfaces (UsageEvent / Telemetry / AuditLog / Identity)
- [ ] Fail-closed auth with scoped admin keys + hashed key storage
- [ ] SSRF allowlist + redirect-credential stripping on outbound provider calls
- [ ] XSS hardening of viewer/feedback pages + ID regex validation
- [ ] Body-size caps on all ingest endpoints
- [ ] SSE: heartbeat + event IDs + `Last-Event-ID` honoring
- [ ] Typed error codes + error catalog page
- [ ] Landing page at `GET /` with an OBS browser-source snippet
- [ ] TTL cleanup service for stopped streams, resolved incidents, stale feedback
- [ ] Boot-time config validation; reject silent misconfiguration
- [ ] Local QR generator (drop third-party `qrserver.com` dependency)

## v0.3 — Production readiness (Q3 2026)

Goal: a team can run this in production with observability and clear scale limits.

- [ ] Provider circuit breaker with visible fallback state (no silent mock)
- [ ] Prometheus `/metrics` endpoint + OpenTelemetry trace propagation
- [ ] Structured logs with request-ID correlation into service logs
- [ ] `pg.Pool` + migrations (node-pg-migrate); retire in-memory as source of truth
- [ ] Bounded translation concurrency + retry-with-jitter
- [ ] Generated Python and Go SDKs from OpenAPI
- [ ] VPAT 2.4 Rev 508 published; WCAG 2.2 AA third-party audit completed

## v0.4 — Ecosystem (Q4 2026)

- [ ] OBS browser-source integration guide + example config
- [ ] Zoom / Teams / Meet captioning SDK adapters (official APIs)
- [ ] Twitch / YouTube Live overlay proxy spike
- [ ] Plugin registry for model providers; capability manifest + signing
- [ ] Sign-language avatar: WebGL 3D avatar pipeline (currently 2D only)
- [ ] DPA template, SOC 2 readiness checklist, data-residency runbook

## v1.0 — Stable API (Q1 2027)

- [ ] API surface frozen under semver; breaking changes require major bump
- [ ] Multi-replica safe: relational schema, no in-memory source of truth
- [ ] Documented upgrade path between minor versions
- [ ] Public CI with security scans (CodeQL, Trivy, Dependabot)
- [ ] Published latency budget (p50/p95/p99 targets per modality)

## Beyond v1.0 (directional, not scheduled)

- Certified model-provider marketplace (commercial edition).
- Managed cloud edition with regional residency + 99.9% SLA.
- Enterprise connectors (SCTE-35 ad-aware ingest, broadcast-grade RTMP/SRT
  tuning, multi-viewer routing).
- Compliance-report generator (EAA conformance artifacts per deployment).
- Accessibility-audit service powered by feedback + incident flywheel.

## How priorities are set

- Security, correctness, and accessibility regressions are always P0.
- Items on this roadmap are weighted by user demand (issues, discussions),
  commercial-path impact, and maintainer bandwidth.
- Out-of-roadmap work is welcome via RFC (see `CONTRIBUTING.md`).

## What is **not** planned

- An AGPL relicense of the OSS core. See `GOVERNANCE.md`.
- A mandatory CLA. Inbound = outbound Apache-2.0.
- Bundling a specific ASR, TTS, or translation vendor. The plugin seams
  stay vendor-neutral.

Last updated: 2026-04-17.
