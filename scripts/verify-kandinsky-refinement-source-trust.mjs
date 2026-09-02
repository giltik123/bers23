import manifest from '../src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json' with { type: 'json' };
import { parseSourcePointer, readBoundedPointerText } from './kandinsky-source-trust-pointer.mjs';
import {
  assertPinnedConfigBytes,
  assertPinnedConfigIdentity,
  assertPinnedRevision,
  readBoundedConfigResponse,
  retryBoundedTrustRead,
} from './kandinsky-config-trust.mjs';
import {
  assertPinnedLicenseBytes,
  assertPinnedLicenseEvidence,
  readBoundedLicenseResponse,
} from './kandinsky-license-trust.mjs';

const HUB = 'https://huggingface.co';
const MAX_ATTEMPTS = 4;
const ATTEMPT_TIMEOUT_MS = 45_000;
const RETRY_BACKOFF_MS = 750;

function transientHttpError(response, label) {
  if (response.status === 408 || response.status === 429 || response.status >= 500) {
    return Object.assign(
      new Error(`Transient HTTP ${response.status} ${response.statusText}: ${label}`),
      { retryableTrustTransport: true },
    );
  }
  return new Error(`HTTP ${response.status} ${response.statusText}: ${label}`);
}

function isRetryableTrustTransportError(error) {
  return error?.retryableTrustTransport === true
    || error instanceof TypeError
    || error?.name === 'AbortError'
    || error?.name === 'TimeoutError';
}

async function fetchAndReadWithRetry(url, accept, label, readResponse) {
  return retryBoundedTrustRead(async () => {
    const response = await fetch(url, {
      headers: { accept, 'user-agent': 'bers-f5b1-source-trust/6' },
      redirect: 'follow',
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
    if (!response.ok) throw transientHttpError(response, label);
    return readResponse(response);
  }, {
    label: `Hugging Face trust read ${label}`,
    maxAttempts: MAX_ATTEMPTS,
    backoffMs: RETRY_BACKOFF_MS,
    shouldRetry: isRetryableTrustTransportError,
  });
}

function encodedRepository(repository) {
  const parts = String(repository).split('/');
  if (parts.length !== 2 || parts.some(part => !part)) throw new Error(`Invalid Hugging Face repository identity: ${repository}`);
  return parts.map(encodeURIComponent).join('/');
}

function encodedPath(path) {
  const parts = String(path).split('/');
  if (parts.length < 1 || parts.some(part => !part || part === '.' || part === '..')) throw new Error(`Invalid pinned source path: ${path}`);
  return parts.map(encodeURIComponent).join('/');
}

async function readPinnedPointer(repository, revision, path) {
  assertPinnedRevision(repository, revision);
  const label = `${repository}@${revision}:${path}`;
  const url = `${HUB}/${encodedRepository(repository)}/raw/${revision}/${encodedPath(path)}`;
  const text = await fetchAndReadWithRetry(url, 'text/plain', label, response => readBoundedPointerText(response, label));
  return parseSourcePointer(text, label);
}

async function readPinnedConfigBytes(repository, revision, path, maxBytes) {
  assertPinnedRevision(repository, revision);
  const label = `${repository}@${revision}:${path}`;
  const url = `${HUB}/${encodedRepository(repository)}/raw/${revision}/${encodedPath(path)}`;
  return fetchAndReadWithRetry(
    url,
    'application/octet-stream',
    label,
    response => readBoundedConfigResponse(response, label, maxBytes),
  );
}

async function readPinnedLicenseBytes(repository, revision, evidence) {
  assertPinnedRevision(repository, revision);
  assertPinnedLicenseEvidence(evidence, `${repository}@${revision} license evidence`);
  const label = `${repository}@${revision}:${evidence.path}`;
  const url = `${HUB}/${encodedRepository(repository)}/raw/${revision}/${encodedPath(evidence.path)}`;
  return fetchAndReadWithRetry(
    url,
    'text/markdown, text/plain;q=0.9',
    label,
    response => readBoundedLicenseResponse(response, label, evidence.maxFileBytes),
  );
}

async function assertPinnedWeights(expected, repository, revision) {
  for (const pinned of expected) {
    const remote = await readPinnedPointer(repository, revision, pinned.path);
    if (remote.size !== pinned.size) {
      throw new Error(`Pinned size drift: ${pinned.path}: manifest=${pinned.size} upstream=${remote.size}`);
    }
    if (remote.sha256 !== pinned.sha256) {
      throw new Error(`Pinned SHA-256 drift: ${pinned.path}: manifest=${pinned.sha256} upstream=${remote.sha256}`);
    }
  }
}

async function assertPinnedConfigs(identity, repository, revision) {
  assertPinnedConfigIdentity(identity, `${repository}@${revision} config identity`);
  let downloadedBytes = 0;
  for (const pinned of identity.files) {
    const bytes = await readPinnedConfigBytes(repository, revision, pinned.path, identity.maxFileBytes);
    assertPinnedConfigBytes(pinned, bytes);
    downloadedBytes += bytes.byteLength;
  }
  return downloadedBytes;
}

async function assertPinnedLicense(evidence, repository, revision) {
  const bytes = await readPinnedLicenseBytes(repository, revision, evidence);
  const result = assertPinnedLicenseBytes(evidence, bytes, `${repository}@${revision}:${evidence.path}`);
  return Object.freeze({ ...result, downloadedBytes: bytes.byteLength });
}

await assertPinnedWeights(manifest.decoder.safeWeights, manifest.decoder.repository, manifest.decoder.revision);
await assertPinnedWeights(manifest.offlinePrior.safeWeights, manifest.offlinePrior.repository, manifest.offlinePrior.revision);
const decoderConfigBytes = await assertPinnedConfigs(manifest.decoder.requiredConfigIdentity, manifest.decoder.repository, manifest.decoder.revision);
const priorConfigBytes = await assertPinnedConfigs(manifest.offlinePrior.requiredConfigIdentity, manifest.offlinePrior.repository, manifest.offlinePrior.revision);
const decoderLicense = await assertPinnedLicense(manifest.decoder.licenseEvidence, manifest.decoder.repository, manifest.decoder.revision);
const priorLicense = await assertPinnedLicense(manifest.offlinePrior.licenseEvidence, manifest.offlinePrior.repository, manifest.offlinePrior.revision);

console.log(JSON.stringify({
  state: 'PASS',
  trustTransport: 'BOUNDED_GIT_LFS_POINTER_PINNED_RAW_CONFIG_AND_REVISION_LICENSE_METADATA',
  transportRetry: {
    maxAttempts: MAX_ATTEMPTS,
    perAttemptTimeoutMs: ATTEMPT_TIMEOUT_MS,
    scope: 'FETCH_PLUS_BOUNDED_BODY_READ_TRANSIENT_ONLY',
  },
  decoder: {
    repository: manifest.decoder.repository,
    revision: manifest.decoder.revision,
    weightFiles: manifest.decoder.safeWeights.length,
    configFiles: manifest.decoder.requiredConfigIdentity.files.length,
    license: decoderLicense.identifier,
  },
  offlinePrior: {
    repository: manifest.offlinePrior.repository,
    revision: manifest.offlinePrior.revision,
    weightFiles: manifest.offlinePrior.safeWeights.length,
    configFiles: manifest.offlinePrior.requiredConfigIdentity.files.length,
    license: priorLicense.identifier,
  },
  downloadedModelBytes: 0,
  downloadedConfigBytes: decoderConfigBytes + priorConfigBytes,
  downloadedLicenseEvidenceBytes: decoderLicense.downloadedBytes + priorLicense.downloadedBytes,
}, null, 2));