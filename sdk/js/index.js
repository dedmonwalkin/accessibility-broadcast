function buildUrl(baseUrl, path, query) {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }
  return url;
}

async function parseResponse(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload.error || `API request failed: ${response.status}`);
  }
  return payload;
}

export class AccessibilityClient {
  constructor({ baseUrl = 'http://localhost:3000', apiKey, fetchImpl } = {}) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey || null;
    this.fetchImpl = fetchImpl || globalThis.fetch;
    if (!this.fetchImpl) throw new Error('No fetch implementation available');
  }

  async request(method, path, { body, query } = {}) {
    const url = buildUrl(this.baseUrl, path, query);
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const response = await this.fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });

    return parseResponse(response);
  }

  health() {
    return this.request('GET', '/health');
  }

  createStream(input) {
    return this.request('POST', '/v1/streams', { body: input });
  }

  createViewer(input) {
    return this.request('POST', '/v1/viewers', { body: input });
  }

  getViewer(viewerId) {
    return this.request('GET', `/v1/viewers/${viewerId}`);
  }

  getViewerPreferences(viewerId) {
    return this.request('GET', `/v1/viewers/${viewerId}/preferences`);
  }

  updateViewerPreferences(viewerId, input) {
    return this.request('PATCH', `/v1/viewers/${viewerId}/preferences`, { body: input });
  }

  startStream(streamId, input) {
    return this.request('POST', `/v1/streams/${streamId}/start`, { body: input });
  }

  stopStream(streamId) {
    return this.request('POST', `/v1/streams/${streamId}/stop`);
  }

  getCaptions(streamId, format, language, viewerId) {
    return this.request('GET', `/v1/streams/${streamId}/captions`, {
      query: { format, language, viewer_id: viewerId }
    });
  }

  getAudioDescription(streamId, viewerId) {
    return this.request('GET', `/v1/streams/${streamId}/audio-description`, {
      query: { viewer_id: viewerId }
    });
  }

  getSignOverlay(streamId, viewerId) {
    return this.request('GET', `/v1/streams/${streamId}/sign-overlay`, {
      query: { viewer_id: viewerId }
    });
  }

  getEvents(streamId) {
    return this.request('GET', `/v1/streams/${streamId}/events`);
  }

  getStreamHealth(streamId) {
    return this.request('GET', `/v1/streams/${streamId}/health`);
  }

  getAccessibilityCoverage() {
    return this.request('GET', '/v1/accessibility/coverage');
  }

  getFeedbackSummary(streamId) {
    return this.request('GET', `/v1/streams/${streamId}/feedback-summary`);
  }

  createFeedback(input) {
    return this.request('POST', '/v1/feedback', { body: input });
  }

  listIncidents(status) {
    return this.request('GET', '/v1/incidents', { query: { status } });
  }

  resolveIncident(incidentId, input) {
    return this.request('POST', `/v1/incidents/${incidentId}/resolve`, { body: input });
  }

  createAdSession(input) {
    return this.request('POST', '/v1/ad/sessions', { body: input });
  }

  logAdEvent(adSessionId, input) {
    return this.request('POST', `/v1/ad/sessions/${adSessionId}/events`, { body: input });
  }

  getAdSession(adSessionId) {
    return this.request('GET', `/v1/ad/sessions/${adSessionId}`);
  }

  getAdTag(adSessionId) {
    return this.request('GET', `/v1/ad/sessions/${adSessionId}/tag`);
  }

  getAdSessionReport(adSessionId) {
    return this.request('GET', `/v1/ad/sessions/${adSessionId}/report`);
  }

  getAdCampaignReport(campaignId) {
    return this.request('GET', `/v1/ad/campaigns/${campaignId}/report`);
  }
}
