export const FRONTEND_CSP_HEADER = 'content-security-policy';
export const FRONTEND_FRAME_ANCESTORS = "'none'";

const RELATIVE_FRONTEND_ORIGIN = 'https://frontend.invalid';
const CANONICAL_CORE_PATH = '/api/core';
const BASE_DIRECTIVES = Object.freeze([
  Object.freeze(['default-src', "'self'"]),
  Object.freeze(['base-uri', "'self'"]),
  Object.freeze(['object-src', "'none'"]),
  Object.freeze(['frame-src', "'none'"]),
  Object.freeze(['form-action', "'self'"]),
  Object.freeze(['script-src', "'self'", "'wasm-unsafe-eval'"]),
  Object.freeze(['script-src-attr', "'none'"]),
  Object.freeze(['style-src', "'self'", "'unsafe-inline'"]),
  Object.freeze(['img-src', "'self'", 'blob:', 'data:', 'https:']),
  Object.freeze(['font-src', "'self'", 'data:']),
  Object.freeze(['worker-src', "'self'", 'blob:']),
  Object.freeze(['manifest-src', "'self'"]),
  Object.freeze(['media-src', "'self'", 'blob:', 'data:']),
  Object.freeze(['require-trusted-types-for', "'script'"]),
  Object.freeze(['trusted-types', "'none'"]),
]);

/** CSP supported by HTML meta delivery. frame-ancestors is intentionally absent. */
export function productionBrowserMetaCsp(coreApiUrl = CANONICAL_CORE_PATH) {
  return serializeCsp([
    ...BASE_DIRECTIVES.slice(0, 10),
    Object.freeze(['connect-src', ...resolveCoreConnectSources(coreApiUrl)]),
    ...BASE_DIRECTIVES.slice(10),
  ]);
}

/** Required HTTP response CSP for the production static frontend. */
export function productionBrowserResponseCsp(coreApiUrl = CANONICAL_CORE_PATH) {
  return `${productionBrowserMetaCsp(coreApiUrl)}; frame-ancestors ${FRONTEND_FRAME_ANCESTORS}`;
}

/** Backward-compatible name used by existing browser contract tests. */
export const productionBrowserCsp = productionBrowserMetaCsp;

export function parseCsp(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Content-Security-Policy header is missing');
  const directives = new Map();
  for (const raw of value.split(';')) {
    const segment = raw.trim();
    if (!segment) continue;
    const [name, ...sources] = segment.split(/\s+/u);
    const key = name.toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/u.test(key) || directives.has(key)) throw new Error(`Invalid or duplicate CSP directive: ${name}`);
    if (new Set(sources).size !== sources.length) throw new Error(`Duplicate CSP source expression in directive: ${name}`);
    directives.set(key, Object.freeze(sources));
  }
  if (directives.size === 0) throw new Error('Content-Security-Policy header is empty');
  return directives;
}

export function assertProductionFrontendResponseCsp(actual, coreApiUrl = CANONICAL_CORE_PATH) {
  const expected = parseCsp(productionBrowserResponseCsp(coreApiUrl));
  const received = parseCsp(actual);
  for (const [directive, sources] of expected) {
    const actualSources = received.get(directive);
    if (!actualSources || !sameTokens(actualSources, sources)) {
      throw new Error(`Frontend CSP directive ${directive} does not match the production contract`);
    }
  }
  if (received.size !== expected.size) throw new Error('Frontend CSP contains directives outside the production contract');
  return true;
}

export function requiredProductionFrontendHeaders(coreApiUrl = CANONICAL_CORE_PATH) {
  return Object.freeze({
    'Content-Security-Policy': productionBrowserResponseCsp(coreApiUrl),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
}

function resolveCoreConnectSources(value) {
  const candidate = String(value || CANONICAL_CORE_PATH).trim();
  if (!candidate) return Object.freeze(["'self'"]);

  if (candidate.startsWith('/')) {
    if (candidate.startsWith('//') || candidate.includes('\\')) {
      throw new Error('VITE_CORE_API_URL must be a single-slash root-relative path or absolute URL');
    }
    let relative;
    try { relative = new URL(candidate, RELATIVE_FRONTEND_ORIGIN); }
    catch { throw new Error('VITE_CORE_API_URL must be a single-slash root-relative path or absolute URL'); }
    if (relative.origin !== RELATIVE_FRONTEND_ORIGIN) throw new Error('VITE_CORE_API_URL root-relative path must remain same-origin');
    assertCanonicalCoreTarget(relative);
    return Object.freeze(["'self'"]);
  }

  let url;
  try { url = new URL(candidate); }
  catch { throw new Error('VITE_CORE_API_URL must be a single-slash root-relative path or absolute URL'); }
  const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !localHttp) throw new Error('VITE_CORE_API_URL must be relative or HTTPS outside localhost');
  if (url.username || url.password) throw new Error('VITE_CORE_API_URL must not contain credentials');
  assertCanonicalCoreTarget(url);
  return Object.freeze(["'self'", url.origin]);
}

function assertCanonicalCoreTarget(url) {
  if (url.search || url.hash) throw new Error('VITE_CORE_API_URL must not contain a query or fragment');
  if (url.pathname !== CANONICAL_CORE_PATH) throw new Error(`VITE_CORE_API_URL must target exactly ${CANONICAL_CORE_PATH}`);
}

function serializeCsp(directives) {
  return directives.map(([name, ...sources]) => `${name} ${sources.join(' ')}`).join('; ');
}

function sameTokens(actual, expected) {
  if (actual.length !== expected.length) return false;
  const values = new Set(actual);
  return values.size === actual.length && expected.every(value => values.has(value));
}
