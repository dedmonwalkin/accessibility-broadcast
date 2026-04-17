import { URL } from 'node:url';

export function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

export function sendHtml(res, statusCode, html, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    ...extraHeaders
  });
  res.end(html);
}

export class PayloadTooLargeError extends Error {
  constructor(limit) {
    super('payload_too_large');
    this.statusCode = 413;
    this.code = 'payload_too_large';
    this.limit = limit;
  }
}

export async function parseBody(req, { maxBytes = 1024 * 1024 } = {}) {
  const contentLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > 0 && contentLength > maxBytes) {
    throw new PayloadTooLargeError(maxBytes);
  }
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > maxBytes) {
      throw new PayloadTooLargeError(maxBytes);
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!raw) return { raw, parsed: {}, contentType };
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(raw);
    return { raw, parsed: Object.fromEntries(params.entries()), contentType };
  }
  try {
    return { raw, parsed: JSON.parse(raw), contentType };
  } catch {
    const err = new Error('invalid_json_body');
    err.statusCode = 400;
    err.code = 'invalid_json_body';
    throw err;
  }
}

export async function parseJsonBody(req, opts) {
  const { parsed } = await parseBody(req, opts);
  return parsed;
}

export function parseUrl(req) {
  return new URL(req.url, `http://${req.headers.host || 'localhost'}`);
}

export function notFound(res) {
  sendJson(res, 404, { error: 'not_found' });
}

export function methodNotAllowed(res) {
  sendJson(res, 405, { error: 'method_not_allowed' });
}
