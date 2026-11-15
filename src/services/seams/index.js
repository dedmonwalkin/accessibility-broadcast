// Open-core seams.
//
// These are the extension points where a future commercial edition
// (or an operator running their own fork) can plug in real behavior:
//   - UsageEventSink: per-request / per-stream-second / per-character
//     metering for billing and capacity planning.
//   - TelemetrySink: OpenTelemetry-shaped span/metric emission.
//   - AuditLogSink: export every audit-log entry to an external SIEM.
//   - IdentityProvider: resolve a bearer token to an org/project/scope.
//
// The OSS default for every seam is a no-op so the service runs
// identically whether a sink is registered or not. Register one or
// more via registerSeams({...}) at boot — typically from an
// edition-specific entrypoint that wraps src/server.js.
//
// Design rule: seam methods must be side-effect-safe and must not
// throw into request paths. Any error is caught and logged, never
// propagated. Missing methods are tolerated (treated as noops).

const NoopUsageSink = {
  record(_event) {}
};

const NoopTelemetrySink = {
  onRequest(_record) {},
  onSse(_record) {}
};

const NoopAuditSink = {
  record(_entry) {}
};

const NoopIdentityProvider = {
  async resolveApiKey(_token) {
    return null;
  }
};

let sinks = {
  usage: NoopUsageSink,
  telemetry: NoopTelemetrySink,
  audit: NoopAuditSink,
  identity: NoopIdentityProvider
};

function safeCall(fn, ...args) {
  try {
    const result = fn(...args);
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
    return result;
  } catch {
    return undefined;
  }
}

export function registerSeams(overrides = {}) {
  sinks = {
    usage: overrides.usage ? { ...NoopUsageSink, ...overrides.usage } : sinks.usage,
    telemetry: overrides.telemetry ? { ...NoopTelemetrySink, ...overrides.telemetry } : sinks.telemetry,
    audit: overrides.audit ? { ...NoopAuditSink, ...overrides.audit } : sinks.audit,
    identity: overrides.identity ? { ...NoopIdentityProvider, ...overrides.identity } : sinks.identity
  };
}

export function resetSeams() {
  sinks = {
    usage: NoopUsageSink,
    telemetry: NoopTelemetrySink,
    audit: NoopAuditSink,
    identity: NoopIdentityProvider
  };
}

export const seams = {
  usage: {
    record(event) { safeCall(sinks.usage.record.bind(sinks.usage), event); }
  },
  telemetry: {
    onRequest(record) { safeCall(sinks.telemetry.onRequest.bind(sinks.telemetry), record); },
    onSse(record) { safeCall(sinks.telemetry.onSse.bind(sinks.telemetry), record); }
  },
  audit: {
    record(entry) { safeCall(sinks.audit.record.bind(sinks.audit), entry); }
  },
  identity: {
    async resolveApiKey(token) {
      try {
        return await sinks.identity.resolveApiKey(token);
      } catch {
        return null;
      }
    }
  }
};

// Dev fallback: X-Org-Id / X-Project-Id headers are honored ONLY when
// no real IdentityProvider has been registered. This lets operators
// experiment with tenant-aware flows without wiring up a full
// identity system.
export function resolveTenantFromHeaders(req) {
  if (sinks.identity !== NoopIdentityProvider) return null;
  const orgId = req?.headers?.['x-org-id'];
  const projectId = req?.headers?.['x-project-id'];
  if (!orgId && !projectId) return null;
  return {
    orgId: orgId ? String(orgId).slice(0, 128) : null,
    projectId: projectId ? String(projectId).slice(0, 128) : null
  };
}
