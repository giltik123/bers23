const API_ROOT = (import.meta.env ?? {}).VITE_CORE_API_URL || '/api/core';
const CSRF_HEADER = 'X-Bers-CSRF-Token';
const EXPECTED_REVISION_HEADER = 'X-Expected-Automation-Revision';
let browserCsrfToken;

function unsafeMethod(method) {
  const normalized = String(method || 'GET').toUpperCase();
  return normalized !== 'GET' && normalized !== 'HEAD' && normalized !== 'OPTIONS';
}

async function ensureCsrfToken() {
  if (browserCsrfToken) return browserCsrfToken;
  const response = await fetch(`${API_ROOT}/auth/context`, { credentials: 'include' });
  const data = await response.json().catch(() => undefined);
  if (!response.ok) throwResponseError(response, data, '/auth/context');
  browserCsrfToken = response.headers.get(CSRF_HEADER) || undefined;
  if (!browserCsrfToken) throw new Error('Authenticated Core context did not provide the browser CSRF token');
  return browserCsrfToken;
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (unsafeMethod(options.method)) headers.set(CSRF_HEADER, await ensureCsrfToken());
  const response = await fetch(`${API_ROOT}${path}`, { ...options, headers, credentials: 'include' });
  if (response.headers.has(CSRF_HEADER)) browserCsrfToken = response.headers.get(CSRF_HEADER) || undefined;
  const data = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) throwResponseError(response, data, path);
  return data;
}

function throwResponseError(response, data, path) {
  if (response.status === 401) browserCsrfToken = undefined;
  const error = new Error(data?.message || `Automation Core request failed (${response.status})`);
  error.status = response.status;
  error.code = data?.code ?? data?.error;
  error.correlationId = data?.correlationId;
  error.path = path;
  error.data = data;
  throw error;
}

function positiveRevision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Automation revision must be a positive safe integer');
  return String(value);
}

function token(value, field) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.includes('/')) throw new Error(`${field} is required`);
  return normalized;
}

const json = (method, body, headers = {}) => ({ method, headers, body: JSON.stringify(body) });
const revisionHeaders = (revision) => ({ [EXPECTED_REVISION_HEADER]: positiveRevision(revision) });

export const automationClient = Object.freeze({
  definitions: Object.freeze({
    list: () => request('/automations'),
    get: (automationId) => request(`/automations/${encodeURIComponent(token(automationId, 'automationId'))}`),
    create: ({ name, plan }) => request('/automations', json('POST', { name, trigger: 'MANUAL', plan })),
    update: ({ automationId, revision, patch }) => request(
      `/automations/${encodeURIComponent(token(automationId, 'automationId'))}`,
      json('PATCH', patch, revisionHeaders(revision)),
    ),
    archive: ({ automationId, revision }) => request(
      `/automations/${encodeURIComponent(token(automationId, 'automationId'))}/archive`,
      json('POST', {}, revisionHeaders(revision)),
    ),
    restore: ({ automationId, revision }) => request(
      `/automations/${encodeURIComponent(token(automationId, 'automationId'))}/restore`,
      json('POST', {}, revisionHeaders(revision)),
    ),
  }),
  invocations: Object.freeze({
    start: ({ automationId, definitionRevision, projectId, clientRequestId }) => request(
      `/automations/${encodeURIComponent(token(automationId, 'automationId'))}/manual-runs`,
      json('POST', {
        projectId: token(projectId, 'projectId'),
        clientRequestId: token(clientRequestId, 'clientRequestId'),
      }, revisionHeaders(definitionRevision)),
    ),
    resume: (invocationId) => request(`/automation-invocations/${encodeURIComponent(token(invocationId, 'invocationId'))}`),
    submitResult: ({ invocationId, result }) => request(
      `/automation-invocations/${encodeURIComponent(token(invocationId, 'invocationId'))}/result`,
      json('POST', { result }),
    ),
    retry: (invocationId) => request(
      `/automation-invocations/${encodeURIComponent(token(invocationId, 'invocationId'))}/retry`,
      json('POST', {}),
    ),
    cancel: (invocationId) => request(
      `/automation-invocations/${encodeURIComponent(token(invocationId, 'invocationId'))}/cancel`,
      json('POST', {}),
    ),
  }),
});
