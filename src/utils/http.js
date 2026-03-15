import { URL } from 'node:url';

export function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

export async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return { raw, parsed: {}, contentType: String(req.headers['content-type'] || '').toLowerCase() };
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(raw);
    return { raw, parsed: Object.fromEntries(params.entries()), contentType };
  }
  try {
    return { raw, parsed: JSON.parse(raw), contentType };
  } catch {
    throw new Error('Invalid JSON body');
  }
}

export async function parseJsonBody(req) {
  const { parsed } = await parseBody(req);
  return parsed;
}

export function parseUrl(req) {
  return new URL(req.url, `http://${req.headers.host || 'localhost'}`);
}

export function notFound(res) {
  sendJson(res, 404, { error: 'Not found' });
}

export function methodNotAllowed(res) {
  sendJson(res, 405, { error: 'Method not allowed' });
}
