import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertProductionFrontendResponseCsp,
  requiredProductionFrontendHeaders,
} from '../config/frontendSecurityPolicy.mjs';

const MIN_PRODUCTION_HSTS_SECONDS = 31_536_000;
const EXACT_SHA_RE = /^[0-9a-f]{40}$/u;
const WORKFLOW_RUN_URL_RE = /^https:\/\/github\.com\/giltik123\/bers23\/actions\/runs\/\d+$/u;

export async function verifyFrontendSecurityHeaders(input) {
  const frontendUrl = normalizeFrontendUrl(input?.frontendUrl);
  const coreApiUrl = input?.coreApiUrl || '/api/core';
  const expectedSha = normalizeExpectedSha(input?.expectedSha);
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
  const deployedSha = normalizeObservedDeploymentSha(response.headers.get('x-bers-deployment-sha'));
  if (expectedSha && deployedSha !== expectedSha) {
    throw new Error(`Frontend deployment SHA mismatch: expected ${expectedSha}, received ${deployedSha ?? 'missing'}`);
  }

  const html = await response.text();
  if (!html.trim()) throw new Error('Frontend root returned an empty HTML document');

  const observedHeaders = Object.freeze({
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': response.headers.get('x-content-type-options'),
    'X-Frame-Options': response.headers.get('x-frame-options'),
    'Referrer-Policy': response.headers.get('referrer-policy'),
    'Strict-Transport-Security': response.headers.get('strict-transport-security'),
  });

  return Object.freeze({
    frontendUrl: frontendUrl.toString(),
    coreApiUrl,
    status: response.status,
    requiredHeaders: requiredProductionFrontendHeaders(coreApiUrl),
    observedHeaders,
    deployedSha,
    htmlSha256: createHash('sha256').update(html).digest('hex'),
  });
}

function normalizeExpectedSha(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (!EXACT_SHA_RE.test(normalized)) throw new Error('Expected frontend deployment SHA must be one exact Git SHA');
  return normalized;
}

function normalizeObservedDeploymentSha(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (!EXACT_SHA_RE.test(normalized)) throw new Error('Frontend X-BERS-Deployment-SHA header must be one exact Git SHA');
  return normalized;
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
  const maxAgeDirectives = directives.filter(part => /^max-age\s*=/iu.test(part));
  if (maxAgeDirectives.length !== 1) {
    throw new Error('HTTPS frontend Strict-Transport-Security must contain exactly one max-age directive');
  }
  const match = /^max-age=(\d+)$/iu.exec(maxAgeDirectives[0]);
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
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Frontend URL must not contain credentials, a query, or a fragment');
  }
  return url;
}

export function buildFrontendSecurityEvidence(result, provenance = {}) {
  const verifiedAt = provenance.verifiedAt ?? new Date().toISOString();
  if (typeof verifiedAt !== 'string' || !Number.isFinite(Date.parse(verifiedAt))) {
    throw new Error('Frontend security evidence verifiedAt is invalid');
  }

  const evidence = {
    schemaVersion: 1,
    kind: 'BERS_V1_FRONTEND_SECURITY_EVIDENCE',
    verifiedAt,
    ...result,
  };

  const hosted = [provenance.verifiedSha, provenance.workflowRunUrl, provenance.artifactName];
  const hasHosted = hosted.some(value => value !== undefined && value !== null && value !== '');
  if (hasHosted) {
    const verifiedSha = String(provenance.verifiedSha ?? '');
    const workflowRunUrl = String(provenance.workflowRunUrl ?? '');
    const artifactName = String(provenance.artifactName ?? '');
    if (!EXACT_SHA_RE.test(verifiedSha)) {
      throw new Error('Hosted frontend evidence verifiedSha must be one exact Git SHA');
    }
    if (!EXACT_SHA_RE.test(String(result?.deployedSha ?? ''))) {
      throw new Error('Hosted frontend evidence requires one exact deployedSha from the live frontend');
    }
    if (result.deployedSha !== verifiedSha) {
      throw new Error('Hosted frontend evidence deployedSha must equal verifiedSha');
    }
    if (!WORKFLOW_RUN_URL_RE.test(workflowRunUrl)) {
      throw new Error('Hosted frontend evidence workflowRunUrl is invalid');
    }
    if (artifactName !== `bers-v1-frontend-security-${verifiedSha}`) {
      throw new Error('Hosted frontend evidence artifactName must bind verifiedSha');
    }
    evidence.verifiedSha = verifiedSha;
    evidence.workflowRunUrl = workflowRunUrl;
    evidence.artifactName = artifactName;
  }

  return Object.freeze(evidence);
}

async function main() {
  const frontendUrl = process.argv[2] || process.env.FRONTEND_URL;
  const coreApiUrl = process.argv[3] || process.env.CORE_API_URL || '/api/core';
  const evidenceOut = process.env.EVIDENCE_OUT?.trim() || null;
  const result = await verifyFrontendSecurityHeaders({ frontendUrl, coreApiUrl, expectedSha: process.env.VERIFIED_SHA });
  const evidence = buildFrontendSecurityEvidence(result, {
    verifiedSha: process.env.VERIFIED_SHA,
    workflowRunUrl: process.env.WORKFLOW_RUN_URL,
    artifactName: process.env.ARTIFACT_NAME,
  });
  if (evidenceOut) {
    await mkdir(dirname(evidenceOut), { recursive: true });
    await writeFile(evidenceOut, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
  console.log(JSON.stringify({
    status: 'PASS',
    frontendUrl: result.frontendUrl,
    coreApiUrl: result.coreApiUrl,
    evidenceOut,
    deployedSha: result.deployedSha,
    htmlSha256: result.htmlSha256,
  }));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
