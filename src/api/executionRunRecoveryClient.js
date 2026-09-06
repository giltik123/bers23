const DEFAULT_API_ROOT = (import.meta.env ?? {}).VITE_CORE_API_URL || '/api/core';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_LIMIT = 100;

export function createExecutionRunRecoveryClient({ fetcher = globalThis.fetch, apiRoot = DEFAULT_API_ROOT } = {}) {
  if (typeof fetcher !== 'function') throw new TypeError('ExecutionRun recovery fetcher is required');
  const root = canonicalApiRoot(apiRoot);
  const read = async (path) => {
    const response = await fetcher(`${root}${path}`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const data = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) throw recoveryError(response, data);
    return data;
  };

  return Object.freeze({
    listRoots(projectId, limit = 50) {
      return read(`/execution-runs?${new URLSearchParams({ projectId: canonicalUuid(projectId, 'projectId'), limit: String(canonicalLimit(limit)) })}`);
    },
    get(runId, projectId) {
      return read(`/execution-runs/${encodeURIComponent(canonicalUuid(runId, 'runId'))}?${new URLSearchParams({ projectId: canonicalUuid(projectId, 'projectId') })}`);
    },
    listChildren(runId, projectId, limit = 100) {
      return read(`/execution-runs/${encodeURIComponent(canonicalUuid(runId, 'runId'))}/children?${new URLSearchParams({ projectId: canonicalUuid(projectId, 'projectId'), limit: String(canonicalLimit(limit)) })}`);
    },
  });
}

export const executionRunRecoveryClient = createExecutionRunRecoveryClient();

function canonicalApiRoot(value) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('ExecutionRun recovery API root is required');
  return value.trim().replace(/\/+$/, '');
}

function canonicalUuid(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a UUID`);
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (!UUID.test(normalized)) throw new TypeError(`${label} must be a UUID`);
  return normalized;
}

function canonicalLimit(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIMIT) throw new TypeError(`limit must be an integer from 1 to ${MAX_LIMIT}`);
  return value;
}

function recoveryError(response, data) {
  const error = new Error(data?.message || `ExecutionRun recovery request failed (${response.status})`);
  error.status = response.status;
  error.code = data?.code ?? data?.error ?? 'execution_run_recovery_error';
  error.correlationId = data?.correlationId;
  return error;
}
