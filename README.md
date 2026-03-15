# Accessibility Broadcast (Standalone)

This is a standalone extraction of the live accessibility pipeline:
- RTMP/SRT ingest session APIs
- captions (WebVTT/TTML)
- audio description
- sign script + 2D/basic-sign-card overlay
- viewer personalization profiles
- feedback + ad-session reporting

## Run

```bash
npm start
```

Server defaults to `http://localhost:3000`.

## Test

```bash
npm test
```

## Quick Start

```bash
curl -X POST http://localhost:3000/v1/streams \
  -H 'content-type: application/json' \
  -d '{
    "name":"Arena Main Feed",
    "output_languages":["en-US","es-ES"],
    "sign_languages":["ASL","BSL"],
    "sign_presentation_mode":"avatar_2d"
  }'
```

```bash
curl -X POST http://localhost:3000/v1/streams/<STREAM_ID>/start \
  -H 'content-type: application/json' \
  -d '{"protocol":"rtmp","source_url":"rtmp://encoder.local/live/main"}'
```

```bash
curl -X POST http://localhost:3000/v1/viewers \
  -H 'content-type: application/json' \
  -d '{
    "stream_id":"<STREAM_ID>",
    "display_name":"Viewer A",
    "preferences":{
      "caption_language":"es-ES",
      "caption_style":"simplified",
      "audio_description_style":"concise",
      "sign_presentation_mode":"basic_signs_book"
    }
  }'
```

```bash
curl "http://localhost:3000/v1/streams/<STREAM_ID>/captions?viewer_id=<VIEWER_ID>"
curl "http://localhost:3000/v1/streams/<STREAM_ID>/audio-description?viewer_id=<VIEWER_ID>"
curl "http://localhost:3000/v1/streams/<STREAM_ID>/sign-overlay?viewer_id=<VIEWER_ID>"
```

## OpenAPI + SDK

- OpenAPI: `openapi/openapi.yaml`
- JS SDK: `sdk/js`

## Optional model gateway stub

```bash
npm run start:model-gateway
```

Set:

```bash
export MODEL_PROVIDER=http
export MODEL_HTTP_BASE_URL=http://localhost:4011
```
