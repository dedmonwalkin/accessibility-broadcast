import crypto from 'node:crypto';

const metrics = {
  requests: new Map(),
  activeConnections: 0,
  activeSseConnections: 0,
  totalSseEventsSent: 0,
  startedAt: Date.now()
};

export function generateRequestId() {
  return crypto.randomUUID();
}

export function logRequest({ method, path, statusCode, durationMs, requestId }) {
  const key = `${method}:${path}:${statusCode}`;
  metrics.requests.set(key, (metrics.requests.get(key) || 0) + 1);

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    requestId,
    method,
    path,
    statusCode,
    durationMs
  }));
}

export function getMetrics() {
  const requestCounts = {};
  for (const [key, count] of metrics.requests) {
    requestCounts[key] = count;
  }
  return {
    uptime_seconds: Math.floor((Date.now() - metrics.startedAt) / 1000),
    active_connections: metrics.activeConnections,
    active_sse_connections: metrics.activeSseConnections,
    total_sse_events_sent: metrics.totalSseEventsSent,
    memory: process.memoryUsage(),
    request_counts: requestCounts
  };
}

export function incrementConnections() { metrics.activeConnections++; }
export function decrementConnections() { metrics.activeConnections--; }
export function incrementSse() { metrics.activeSseConnections++; }
export function decrementSse() { metrics.activeSseConnections--; }
export function incrementSseEvents() { metrics.totalSseEventsSent++; }
