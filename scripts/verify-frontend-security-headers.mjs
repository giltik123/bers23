import { pathToFileURL } from 'node:url';
import {
  assertProductionFrontendResponseCsp,
  requiredProductionFrontendHeaders,
} from '../config/frontendSecurityPolicy.mjs';

const MIN_PRODUCTION_HSTS_SECONDS = 31_536_000;

export async function verifyFrontendSecurityHeaders(input) {
  const frontendUrl = normalizeFrontendUrl(input?.frontendUrl);
  const coreApiUrl = input?.coreApiUrl || '/api/core';
  const fetcher = input?.fetcher ?? globalThis.fetch;
  if (typeof fetcher !== 'function') throw new Error('Frontend security verifier requires fetch');

  const response = await fetcher(frontendUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: { Accept: 'text/html,application/xhtml+xml' },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Frontend security verification requires a direct 2xx response; received ${response.status}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!/^text\/html(?:\s*;|$)/iu.test(contentType.trim())) {
    throw new Error(`Frontend root must serve HTML; received ${contentType || 'no Content-Type'}`);
  }

  const csp = response.headers.get('content-security-policy');
  if (!csp) {
    throw new Error('Frontend is missing the HTTP Content-Security-Policy response header; CSP meta is not sufficient for frame-ancestors');
  }
  assertProductionFrontendResponseCsp(csp, coreApiUrl);

  assertExactHeader(response.headers, 'x-content-type-options', 'nosniff');
  assertExactHeader(response.headers, 'x-frame-options', 'DENY');
  assertExactHeader(response.headers, 'referrer-policy', 'no-referrer');
  if (frontendUrl.protocol === 'https:') assertProductionHsts(response.headers.get('strict-transport-security'));

  // Consume the body so a successful verification also proves the deployed root
  // is an actual retrievable HTML document, not a headers-only synthetic response.
  const html = await response.text();
  if (!html.trim()) throw new Error('Frontend root returned an empty HTML document');

  return Object.freeze({
    frontendUrl: frontendUrl.toString(),
    coreApiUrl,
    status: response.status,
    requiredHeaders: requiredProductionFrontendHeaders(coreApiUrl),
  });
}

function assertExactHeader(headers, name, expected) {
  const actual = headers.get(name);
  if (actual?.trim().toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Frontend is missing ${canonicalHeaderName(name)}: ${expected}`);
  }
}

function assertProductionHsts(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('HTTPS frontend is missing Strict-Transport-Security');
  const directives = value.split(';').map(part => part.trim()).filter(Boolean);
  const maxAge = directives.find(part => /^max-age=/iu.test(part));
  const match = maxAge && /^max-age=(\d+)$/iu.exec(maxAge);
  const seconds = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(seconds) || seconds < MIN_PRODUCTION_HSTS_SECONDS) {
    throw new Error(`HTTPS frontend Strict-Transport-Security max-age must be at least ${MIN_PRODUCTION_HSTS_SECONDS}`);
  }
}

function canonicalHeaderName(name) {
  return name.split('-').map(part => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join('-');
}

function normalizeFrontendUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Frontend URL is required');
  let url;
  try { url = new URL(value.trim()); }
  catch { throw new Error('Frontend URL must be an absolute HTTP(S) URL'); }
  const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !localHttp) throw new Error('Frontend URL must use HTTPS outside localhost');
  if (url.username || url.password || url.hash) throw new Error('Frontend URL must not contain credentials or a fragment');
  return url;
}

async function main() {
  const frontendUrl = process.argv[2] || process.env.FRONTEND_URL;
  const coreApiUrl = process.argv[3] || process.env.CORE_API_URL || '/api/core';
  const result = await verifyFrontendSecurityHeaders({ frontendUrl, coreApiUrl });
  console.log(JSON.stringify({
    status: 'PASS',
    frontendUrl: result.frontendUrl,
    coreApiUrl: result.coreApiUrl,
  }));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
