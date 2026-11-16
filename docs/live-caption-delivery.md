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
containing caption, audio-description and sign arrays plus the viewer's sign
theme (`sign_theme`). When API keys are
configured the endpoint requires one by default; set `SSE_PUBLIC_STREAMS=true`
to let the public viewer page and embed connect, since browser `EventSource`
cannot send an `Authorization` header. Subsequent frames are JSON data messages:

- `segment`: original caption, audio-description metadata, sign script.
- `caption.translation`: `stream_id`, `segment_id`, `target_language`, `segment`.
- `captions.interrupted`: the model gateway failed for this stream; `reason` is
  the error code. Sent once per interruption. The next `segment` means captions
  have resumed. A snapshot taken during an interruption has
  `captions_interrupted: true`.
- `stream.stopped`: end the connection.

Caption segments carry `language`, `target_language` and `translation_status`.
Pending translations in snapshots fall back per segment rather than omitting
new originals. Translated rows retain source order when requests complete out
of order. Translation storage is updated after stop but no late translation
event is published to an ended stream.

## Model gateway failures

With `MODEL_PROVIDER=http`, a gateway that is unreachable, returns an error or
returns an unusable body fails the request with HTTP 502
`model_provider_unavailable` and the failing `operation`; a missing or rejected
gateway URL fails it with HTTP 503 `model_provider_misconfigured`. Mock output
is never substituted, so nothing is published for that chunk. All four model
calls for a chunk must succeed; a chunk is not published with some outputs
missing. A stream cannot be started while its gateway is failing.

The first failure on a running stream opens one high-severity
`model_provider_error` incident (later failures update its `failed_requests`
and `last_error_at`), sets `model_provider_status: interrupted` on the stream
health response and sends `captions.interrupted` to viewers. The viewer page and
embed show that captions are interrupted until the next caption arrives, so a
gap is not mistaken for silence.

The `mock` provider is unchanged: it is the default, it returns canned demo
text, and its output is not labelled in the viewer.

## Viewer and embed

Both clients merge by segment ID and ignore a lower-quality original arriving
after a completed translation. Reconnection snapshots recover missed updates.

Both clients take their initial data from the event stream's snapshot. They
request the JSON snapshot endpoints only when the event stream cannot be opened
at all, and once a snapshot has arrived a dropped connection is left to the
browser's own reconnect. When neither route is open without a key they say the
stream is not open for public viewing rather than reporting a load failure.
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

The existing public-browser/protected-JSON auth design, SSE backpressure, server memory retention, source media transports, sign-language
generation quality and multi-instance delivery remain separate work. No API key
was exposed in browser code or auth rule broadened by this change.

The connected product/journey/pipeline notebook lives in the private project
home at `docs/architecture/`; keep its timing and status labels in sync with
future changes. Claude's separate diagram from the other machine was preserved.
