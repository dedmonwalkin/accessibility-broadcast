# Privacy & Data Handling

This document describes what data accessibility-broadcast handles, where it
goes, and how operators should configure it for privacy-respecting deployments.

**Short version:** the software itself sets **zero cookies**, collects **no
analytics by default**, and does not phone home. It is built so the operator
is the data controller and the service is a processor.

## What data flows through the service

The service processes media-derived data to produce accessibility artifacts:

| Category | Examples | Storage | Controlled by |
|---|---|---|---|
| Stream metadata | name, protocol, source URL | in-memory + Postgres snapshot | operator |
| Audio/video chunks | ingested media for Whisper / provider | processed in-flight; not persisted by default | operator |
| Caption & description text | generated output | in-memory + Postgres snapshot | operator |
| Viewer preferences | language, caption style, overlay theme | in-memory + Postgres snapshot; keyed by opaque `viewer_id` | operator |
| Feedback | free-text message, optional contact email/phone, rating | in-memory + Postgres snapshot | operator (**contains user PII**) |
| Audit log | API actions with their payloads | in-memory (default) or sink | operator |

### Data that is **not** collected by the software

- End-user IP addresses are seen by the Node process in request headers but
  **are not persisted** by the application. They may appear transiently in
  rate-limit state (60-second window) and in logs if the operator logs them.
- No tracking cookies. The viewer page uses `sessionStorage` only for
  transient state and writes **nothing persistent** to the browser.
- No third-party scripts are loaded by the embed overlay.
- No telemetry is sent to the maintainer. The `TelemetrySink` interface is
  Noop by default; an operator must deliberately wire a sink to opt in.

## Cookies

The default viewer page (`/viewer/:streamId`) and feedback page (`/feedback`)
do not set cookies. If you extend the service to add session cookies, you are
responsible for cookie consent under GDPR, ePrivacy, and CCPA/CPRA.

## Consent & GDPR posture

In EU/EEA/UK deployments, the **operator is the data controller** and the
software is a **processor** within the meaning of GDPR Articles 4(7) and
4(8). A sample Data Processing Addendum template is available at
`docs/dpa-template.md` (coming soon).

The service is designed to make Article 17 (right to erasure) requests
straightforward:

- Viewer preferences are keyed by `viewer_id` — delete the record.
- Feedback entries are keyed by `feedback_id`; the admin list endpoint
  surfaces them for review and deletion.

We recommend operators:

1. Publish their own privacy policy naming the service as a processor.
2. Set a retention window for feedback and stream snapshots (the cleanup
   service honors `FEEDBACK_TTL_MS` and `STREAM_TTL_MS` once enabled).
3. Avoid sending raw audio/video to third-party providers without a DPA in
   place with that provider.

## CCPA / CPRA posture

California residents have rights to know, delete, and correct under CCPA.
Because the software does not sell or share personal information by default,
the main compliance surface is deletion — again served by the `viewer_id`
and `feedback_id` keys above.

## EU Accessibility Act

The service is intended to help operators **meet** the accessibility
requirements of the EU Accessibility Act (2025). It is not itself a CE-marked
product; operators remain responsible for their own conformance. A WCAG 2.2
AA conformance review of the viewer UI and overlay script is in progress and
will publish as a VPAT in `docs/vpat.md`.

## Third parties

The service can be configured to call:

- **Model provider** via `MODEL_HTTP_BASE_URL` — fully operator-controlled.
- **Translation provider** — mock, LibreTranslate, or DeepL. LibreTranslate
  and DeepL are external data processors subject to their own terms. The
  operator must accept those terms and update their own privacy notice.
- **Whisper / ASR** — if you configure a hosted Whisper endpoint, audio
  chunks traverse it. Consider self-hosting for sensitive content.

The viewer page in this repository historically fetched a QR image from
`api.qrserver.com`. This is being removed in favor of a local QR generator
so that the overlay has **zero third-party script or image loads** in its
default deployment.

## Children's data

The service does not target children. Operators who deploy it in contexts
where children are in the audience (schools, youth venues) remain
responsible for COPPA / UK-AADC compliance.

## Changes to this policy

Material changes to this document will be called out in release notes and
in the changelog. The document lives in git; its history is the
authoritative record.

## Contact

Privacy questions: open an issue tagged `privacy` if non-sensitive, or use the
[private advisory channel](https://github.com/dedmonwalkin/accessibility-broadcast/security/advisories/new)
for anything involving PII.
