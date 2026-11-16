// Errors caused by the caller's request (unknown ID, missing field, wrong
// state). The server's error handler returns these as HTTP 400 with the stable
// `code` and optional `details`; the human-readable message stays server-side.
// Anything thrown without a code is treated as an internal error (HTTP 500).
export function clientError(code, message, details) {
  const err = new Error(message || code);
  err.statusCode = 400;
  err.code = code;
  if (details) err.details = details;
  return err;
}

// Errors caused by a service this server depends on (the model gateway being
// down, or configured wrongly). Returned as HTTP 502/503 with the stable
// `code` and optional `details`, and logged server-side with the message.
export function upstreamError(code, message, statusCode = 502, details) {
  const err = new Error(message || code);
  err.statusCode = statusCode;
  err.code = code;
  if (details) err.details = details;
  return err;
}

export function isModelProviderError(error) {
  return typeof error?.code === 'string' && error.code.startsWith('model_provider_');
}
