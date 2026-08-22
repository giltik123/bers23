import '@/lib/app-params';

const API_ROOT = (import.meta.env ?? {}).VITE_CORE_API_URL || '/api/core';
let pendingBrowserGrant;
if (typeof window !== 'undefined') {
  const current = new URL(window.location.href);
  const fragment = new URLSearchParams(current.hash.startsWith('#') ? current.hash.slice(1) : current.hash);
  pendingBrowserGrant = fragment.get('auth_code') || undefined;
  if (pendingBrowserGrant) {
    fragment.delete('auth_code');
    current.hash = fragment.toString() ? `#${fragment.toString()}` : '';
    window.history.replaceState({}, document.title, `${current.pathname}${current.search}${current.hash}`);
  }
}

function safeReturnTo(value = '/') {
  if (typeof window === 'undefined') return '/';
  try {
    const target = new URL(value || '/', window.location.origin);
    if (target.origin !== window.location.origin) return '/';
    target.hash = '';
    for (const key of ['access_token','auth_code','token','reset_token','resetToken','verification_handle','verificationHandle']) target.searchParams.delete(key);
    return `${target.pathname}${target.search}` || '/';
  } catch { return '/'; }
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_ROOT}${path}`, { ...options, headers, credentials: 'include' });
  const data = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = new Error(data?.message || `Core API request failed (${response.status})`);
    error.status = response.status;
    error.code = data?.code;
    error.correlationId = data?.correlationId;
    error.retryable = data?.retryable ?? false;
    error.data = data;
    throw error;
  }
  return data;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });
const entity = (name) => ({
  list: (sort, limit) => request(`/data/${name}?${new URLSearchParams({ ...(sort && { sort }), ...(limit && { limit }) })}`),
  get: (id) => request(`/data/${name}/${encodeURIComponent(id)}`),
  filter: (query, sort, limit) => request(`/data/${name}/query`, json('POST', { query, sort, limit })),
  create: (value) => request(`/data/${name}`, json('POST', value)),
  update: (id, value) => request(`/data/${name}/${encodeURIComponent(id)}`, json('PATCH', value)),
  delete: (id) => request(`/data/${name}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  bulkCreate: (values) => request(`/data/${name}/bulk`, json('POST', { values })),
});
const entities = new Proxy({}, { get: (_target, name) => entity(String(name)) });

export const coreClient = Object.freeze({
  auth: {
    me: () => request('/auth/context'),
    register: (payload) => request('/auth/register', json('POST', payload)),
    verifyOtp: (payload) => request('/auth/verify-otp', json('POST', payload)),
    resendOtp: (email, verificationHandle) => request('/auth/resend-otp', json('POST', { email, verificationHandle })),
    resetPasswordRequest: (email) => request('/auth/password/reset-request', json('POST', { email })),
    resetPassword: (payload) => request('/auth/password/reset', json('POST', payload)),
    loginViaEmailPassword: (email, password) => request('/auth/password/login', json('POST', { email, password })),
    exchangePendingBrowserGrant: async () => {
      if (!pendingBrowserGrant) return false;
      const code = pendingBrowserGrant; pendingBrowserGrant = undefined;
      await request('/auth/exchange', json('POST', { code }));
      return true;
    },
    logout: async (returnTo) => {
      await request('/auth/logout', { method: 'POST' });
      if (returnTo && typeof window !== 'undefined') window.location.assign(`/login?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`);
    },
    redirectToLogin: (returnTo) => window.location.assign(`/login?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`),
    loginWithProvider: (provider, returnTo = '/') => window.location.assign(`${API_ROOT}/auth/login/${encodeURIComponent(provider)}?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`),
  },
  creative: {
    execute: (payload) => request('/creative/execute', json('POST', payload)),
    status: (executionId) => request(`/creative/${encodeURIComponent(executionId)}/status`),
    result: (executionId) => request(`/creative/${encodeURIComponent(executionId)}/result`),
    cancel: (executionId) => request(`/creative/${encodeURIComponent(executionId)}/cancel`, { method: 'POST' }),
  },
  artifacts: { persistMask: ({ projectId, width, height, alpha }) => request(`/artifacts/masks?${new URLSearchParams({ projectId, width: String(width), height: String(height) })}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: alpha }) },
  projects: {
    list: () => request('/projects'), get: (id) => request(`/projects/${encodeURIComponent(id)}`),
    createFromFile: ({ file, name }) => request(`/projects?${new URLSearchParams({ name: name || file.name.replace(/\.[^.]+$/, '') })}`, { method: 'POST', headers: { 'Content-Type': file.type }, body: file }),
    update: (id, patch) => request(`/projects/${encodeURIComponent(id)}`, json('PATCH', patch)), delete: (id) => request(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    acceptFinal: (id, finalArtifactId, instruction) => request(`/projects/${encodeURIComponent(id)}/accept-final`, json('POST', { finalArtifactId, instruction })),
    undo: (id) => request(`/projects/${encodeURIComponent(id)}/undo`, { method: 'POST' }), redo: (id) => request(`/projects/${encodeURIComponent(id)}/redo`, { method: 'POST' }),
    restoreOriginal: (id) => request(`/projects/${encodeURIComponent(id)}/restore-original`, { method: 'POST' }), createVersion: (id, name) => request(`/projects/${encodeURIComponent(id)}/versions`, json('POST', { name })),
    restoreVersion: (id, versionId) => request(`/projects/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`, { method: 'POST' }),
  },
  entities,
  functions: { invoke: (command, payload) => request(`/commands/${encodeURIComponent(command)}`, json('POST', payload)) },
  integrations: { Core: { UploadFile: async ({ file }) => { const body = new FormData(); body.append('file', file); return request('/assets', { method: 'POST', body }); }, InvokeLLM: (payload) => request('/creative/execute', json('POST', payload)) } },
  analytics: { track: (event) => request('/observability/events', json('POST', event)).catch(() => undefined) },
  system: { publicSettings: () => request('/config/public'), health: () => request('/health') },
});
