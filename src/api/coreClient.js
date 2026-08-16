import { appParams } from '@/lib/app-params';

const API_ROOT = import.meta.env.VITE_CORE_API_URL || '/api/core';

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (appParams.token) headers.set('Authorization', `Bearer ${appParams.token}`);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_ROOT}${path}`, { ...options, headers });
  const data = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = new Error(data?.message || `Core API request failed (${response.status})`);
    error.status = response.status;
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
    resendOtp: (email) => request('/auth/resend-otp', json('POST', { email })),
    resetPasswordRequest: (email) => request('/auth/password/reset-request', json('POST', { email })),
    resetPassword: (payload) => request('/auth/password/reset', json('POST', payload)),
    setToken: (token) => localStorage.setItem('core_access_token', token),
    logout: (returnTo) => { localStorage.removeItem('core_access_token'); if (returnTo) window.location.assign(`/login?return_to=${encodeURIComponent(returnTo)}`); },
    redirectToLogin: (returnTo) => window.location.assign(`/login?return_to=${encodeURIComponent(returnTo)}`),
    loginWithProvider: (provider, returnTo = '/') => window.location.assign(`${API_ROOT}/auth/login/${encodeURIComponent(provider)}?return_to=${encodeURIComponent(returnTo)}`),
  },
  entities,
  functions: { invoke: (command, payload) => request(`/commands/${encodeURIComponent(command)}`, json('POST', payload)) },
  integrations: { Core: {
    UploadFile: async ({ file }) => { const body = new FormData(); body.append('file', file); return request('/assets', { method: 'POST', body }); },
    InvokeLLM: (payload) => request('/creative/execute', json('POST', payload)),
  } },
  analytics: { track: (event) => request('/observability/events', json('POST', event)).catch(() => undefined) },
  system: {
    publicSettings: () => request('/config/public'),
    health: () => request('/health'),
  },
});
