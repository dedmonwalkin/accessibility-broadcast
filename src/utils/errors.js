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
