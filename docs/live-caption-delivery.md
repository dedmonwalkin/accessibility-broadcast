# Live caption delivery

Local fix branch: `codex/live-caption-delivery`, based on `67c2864`.

## Event order

`ingestChunk` creates a unique segment ID and emits the original `segment`
before it calls the translation provider. Each requested language produces a
`caption.translation` event for that ID when its work completes. Per-connection
projection applies caption language/style and audio-description style from
`viewer_id`; optional `language` overrides the caption language consistently
with the snapshot endpoint.

The ingest HTTP response still waits for translations. This change removes
translation from the original event's delivery path; it does not introduce a
background worker, durable queue or lower the preceding model inference cost.

The normal `translate()` string API is retained for provider callers. The
delivery path uses `translateCaption()` with explicit `original`, `translated`,
`mock` or `unavailable` status. An unavailable translation retains source text
and its source language rather than presenting an untranslated fallback as a
successful translation. Source language is currently fixed to en-US by stream
creation; general source-language selection is outside this change.

## SSE connection

`GET /v1/streams/:id/events/stream?viewer_id=...&language=...` validates the stream
and profile before sending SSE headers. It starts with a personalized `snapshot`
containing caption, audio-description and sign arrays. Subsequent frames are
JSON data messages:

- `segment`: original caption, audio-description metadata, sign script.
- `caption.translation`: `stream_id`, `segment_id`, `target_language`, `segment`.
- `stream.stopped`: end the connection.

Caption segments carry `language`, `target_language` and `translation_status`.
Pending translations in snapshots fall back per segment rather than omitting
new originals. Translated rows retain source order when requests complete out
of order. Translation storage is updated after stop but no late translation
event is published to an ended stream.

## Viewer and embed

Both clients merge by segment ID and ignore a lower-quality original arriving
after a completed translation. Reconnection snapshots recover missed updates.
Caption/audio buffers keep at most 500 rows; the embed keeps the newest caption
and ignores older translations arriving after newer segments.

The embed accepts `ACCESSIBILITY_VIEWER_ID` and
`ACCESSIBILITY_CAPTION_LANGUAGE` alongside `ACCESSIBILITY_STREAM_ID`.
Snapshot fallback uses the same parameters. The viewer URL already accepts a
profile; its EventSource now forwards it.

## Verification and boundaries

Regression tests exercise a gated slow provider, failure status, independent
language/style projection, unique concurrent IDs, reversed completion order,
stopping mid-translation, client merge behavior, actual HTTP SSE delivery and
reconnection, and validation before opening a stream. Translation requests in
tests are mocked; no external provider or Postgres integration is implied.

The existing public-browser/protected-JSON auth design, model fallback provenance,
SSE backpressure, server memory retention, source media transports, sign-language
generation quality and multi-instance delivery remain separate work. No API key
was exposed in browser code or auth rule broadened by this change.

The connected product/journey/pipeline notebook lives in the private project
home at `docs/architecture/`; keep its timing and status labels in sync with
future changes. Claude's separate diagram from the other machine was preserved.
