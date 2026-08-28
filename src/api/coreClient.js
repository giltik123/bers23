import '@/lib/app-params';

const API_ROOT = (import.meta.env ?? {}).VITE_CORE_API_URL || '/api/core';
const CSRF_HEADER = 'X-Bers-CSRF-Token';
const LOCAL_INPUT_WIDTH_HEADER = 'X-Bers-Local-Input-Width';
const LOCAL_INPUT_HEIGHT_HEADER = 'X-Bers-Local-Input-Height';
const LOCAL_SOURCE_SHA_HEADER = 'X-Bers-Local-Source-Sha256';
const LOCAL_MASK_SHA_HEADER = 'X-Bers-Local-Mask-Sha256';
let browserCsrfToken;

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

function unsafeMethod(method) {
  const normalized = String(method || 'GET').toUpperCase();
  return normalized !== 'GET' && normalized !== 'HEAD' && normalized !== 'OPTIONS';
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (unsafeMethod(options.method) && browserCsrfToken) headers.set(CSRF_HEADER, browserCsrfToken);
  const response = await fetch(`${API_ROOT}${path}`, { ...options, headers, credentials: 'include' });
  if (response.headers.has(CSRF_HEADER)) browserCsrfToken = response.headers.get(CSRF_HEADER) || undefined;
  const data = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) throwResponseError(response, data, path);
  return data;
}

async function requestBytes(path, options = {}) {
  const headers = new Headers(options.headers);
  if (unsafeMethod(options.method) && browserCsrfToken) headers.set(CSRF_HEADER, browserCsrfToken);
  const response = await fetch(`${API_ROOT}${path}`, { ...options, headers, credentials: 'include' });
  if (response.headers.has(CSRF_HEADER)) browserCsrfToken = response.headers.get(CSRF_HEADER) || undefined;
  if (!response.ok) {
    const data = await response.json().catch(() => undefined);
    throwResponseError(response, data, path);
  }
  if ((response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase() !== 'application/octet-stream') throw new Error('Core local input delivery returned an unexpected media type');
  return Object.freeze({ bytes: new Uint8Array(await response.arrayBuffer()), headers: response.headers });
}

function throwResponseError(response, data, path) {
  if (response.status === 401 && path === '/auth/context') browserCsrfToken = undefined;
  const error = new Error(data?.message || `Core API request failed (${response.status})`);
  error.status = response.status;
  error.code = data?.code ?? data?.error;
  error.correlationId = data?.correlationId;
  error.retryable = data?.retryable ?? false;
  error.data = data;
  throw error;
}

function requiredPositiveIntegerHeader(headers, name) {
  const value = Number(headers.get(name));
  if (!Number.isInteger(value) || value < 1) throw new Error(`Core local input delivery is missing ${name}`);
  return value;
}
function requiredShaHeader(headers, name) {
  const value = headers.get(name) || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`Core local input delivery is missing ${name}`);
  return value.toLowerCase();
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
  localExecution: {
    prepareSegmentation: (payload) => request('/local-execution/segment/prepare', json('POST', payload)),
    uploadMask: ({ ticketId, projectId, width, height, alpha }) => request(`/local-execution/${encodeURIComponent(ticketId)}/mask-upload?${new URLSearchParams({ projectId, width: String(width), height: String(height) })}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: alpha }),
    submit: ({ ticketId, projectId, result }) => request(`/local-execution/${encodeURIComponent(ticketId)}/result`, json('POST', { projectId, result })),
    prepareBackgroundIsolation: (payload) => request('/local-execution/background-isolation/prepare', json('POST', payload)),
    loadBackgroundIsolationInputs: async ({ ticketId, projectId }) => {
      const delivered = await requestBytes(`/local-execution/background-isolation/${encodeURIComponent(ticketId)}/inputs?${new URLSearchParams({ projectId })}`);
      const width = requiredPositiveIntegerHeader(delivered.headers, LOCAL_INPUT_WIDTH_HEADER);
      const height = requiredPositiveIntegerHeader(delivered.headers, LOCAL_INPUT_HEIGHT_HEADER);
      const pixelCount = width * height;
      if (!Number.isSafeInteger(pixelCount) || delivered.bytes.byteLength !== pixelCount * 5) throw new Error('Core local input delivery byte length does not match its geometry');
      const sourceBytes = pixelCount * 4;
      return Object.freeze({
        width,
        height,
        sourceSha256: requiredShaHeader(delivered.headers, LOCAL_SOURCE_SHA_HEADER),
        maskSha256: requiredShaHeader(delivered.headers, LOCAL_MASK_SHA_HEADER),
        sourceRgba: new Uint8ClampedArray(delivered.bytes.slice(0, sourceBytes).buffer),
        maskAlpha: delivered.bytes.slice(sourceBytes),
      });
    },
    uploadBackgroundIsolationImage: ({ ticketId, projectId, bytes }) => request(`/local-execution/background-isolation/${encodeURIComponent(ticketId)}/image-upload?${new URLSearchParams({ projectId })}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: bytes }),
    submitBackgroundIsolation: ({ ticketId, projectId, result }) => request(`/local-execution/background-isolation/${encodeURIComponent(ticketId)}/result`, json('POST', { projectId, result })),
    prepareCrop: (payload) => request('/local-execution/crop/prepare', json('POST', payload)),
    loadCropInput: async ({ ticketId, projectId }) => {
      const delivered = await requestBytes(`/local-execution/crop/${encodeURIComponent(ticketId)}/inputs?${new URLSearchParams({ projectId })}`);
      const width = requiredPositiveIntegerHeader(delivered.headers, LOCAL_INPUT_WIDTH_HEADER);
      const height = requiredPositiveIntegerHeader(delivered.headers, LOCAL_INPUT_HEIGHT_HEADER);
      const pixelCount = width * height;
      if (!Number.isSafeInteger(pixelCount) || delivered.bytes.byteLength !== pixelCount * 4) throw new Error('Core Crop input byte length does not match its canonical geometry');
      return Object.freeze({
        width,
        height,
        sourceSha256: requiredShaHeader(delivered.headers, LOCAL_SOURCE_SHA_HEADER),
        sourceRgba: Uint8ClampedArray.from(delivered.bytes),
      });
    },
    uploadCropImage: ({ ticketId, projectId, bytes }) => request(`/local-execution/crop/${encodeURIComponent(ticketId)}/image-upload?${new URLSearchParams({ projectId })}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: bytes }),
    submitCrop: ({ ticketId, projectId, result }) => request(`/local-execution/crop/${encodeURIComponent(ticketId)}/result`, json('POST', { projectId, result })),
    prepareSuperResolution: (payload) => request('/local-execution/super-resolution/prepare', json('POST', payload)),
    loadSuperResolutionInput: async ({ ticketId, projectId }) => {
      const delivered = await requestBytes(`/local-execution/super-resolution/${encodeURIComponent(ticketId)}/inputs?${new URLSearchParams({ projectId })}`);
      const width = requiredPositiveIntegerHeader(delivered.headers, LOCAL_INPUT_WIDTH_HEADER);
      const height = requiredPositiveIntegerHeader(delivered.headers, LOCAL_INPUT_HEIGHT_HEADER);
      const pixelCount = width * height;
      if (!Number.isSafeInteger(pixelCount) || delivered.bytes.byteLength !== pixelCount * 4) throw new Error('Core super-resolution input byte length does not match its geometry');
      return Object.freeze({
        width,
        height,
        sourceSha256: requiredShaHeader(delivered.headers, LOCAL_SOURCE_SHA_HEADER),
        sourceRgba: Uint8ClampedArray.from(delivered.bytes),
      });
    },
    uploadSuperResolutionImage: ({ ticketId, projectId, bytes }) => request(`/local-execution/super-resolution/${encodeURIComponent(ticketId)}/image-upload?${new URLSearchParams({ projectId })}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: bytes }),
    submitSuperResolution: ({ ticketId, projectId, result }) => request(`/local-execution/super-resolution/${encodeURIComponent(ticketId)}/result`, json('POST', { projectId, result })),
  },
  compositeContinuations: {
    start: (payload) => request('/composite-continuations/start', json('POST', payload)),
    resume: ({ executionId, projectId }) => request(`/composite-continuations/${encodeURIComponent(executionId)}?${new URLSearchParams({ projectId })}`),
    uploadOutput: ({ executionId, projectId, bytes, mimeType }) => request(`/composite-continuations/${encodeURIComponent(executionId)}/output?${new URLSearchParams({ projectId })}`, { method: 'POST', headers: { 'Content-Type': mimeType }, body: bytes }),
    submitResult: ({ executionId, projectId, result }) => request(`/composite-continuations/${encodeURIComponent(executionId)}/result`, json('POST', { projectId, result })),
  },
  artifacts: {
    persistMask: ({ projectId, sourceImageArtifactId, parentMaskArtifactId, width, height, alpha }) => request(`/artifacts/masks?${new URLSearchParams({ projectId, sourceImageArtifactId, ...(parentMaskArtifactId && { parentMaskArtifactId }), width: String(width), height: String(height) })}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: alpha }),
  },
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
