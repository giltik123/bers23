import { createHash } from 'node:crypto';
import manifest from '../src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json' with { type: 'json' };
import { parseSourcePointer, readBoundedPointerText } from './kandinsky-source-trust-pointer.mjs';

const HUB = 'https://huggingface.co';
const MAX_ATTEMPTS = 4;
const MAX_CONFIG_FILE_BYTES = 5 * 1024 * 1024;

async function fetchWithRetry(url, accept = 'text/plain') {
  let last;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept, 'user-agent': 'bers-f5b1-source-trust/3' },
        redirect: 'follow',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      if (attempt < MAX_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`Hugging Face trust request failed: ${url}: ${last instanceof Error ? last.message : String(last)}`);
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

function assertPinnedRevision(repository, revision) {
  if (!/^[0-9a-f]{40}$/i.test(revision)) throw new Error(`Pinned Hugging Face revision must be a 40-hex commit: ${repository}@${revision}`);
}

async function readPinnedPointer(repository, revision, path) {
  assertPinnedRevision(repository, revision);
  const url = `${HUB}/${encodedRepository(repository)}/raw/${revision}/${encodedPath(path)}`;
  const response = await fetchWithRetry(url);
  const text = await readBoundedPointerText(response, `${repository}@${revision}:${path}`);
  return parseSourcePointer(text, `${repository}@${revision}:${path}`);
}

async function readPinnedConfigBytes(repository, revision, path, maxBytes) {
  assertPinnedRevision(repository, revision);
  if (!Number.isSafeInteger(maxBytes) || maxBytes !== MAX_CONFIG_FILE_BYTES) {
    throw new Error(`Pinned config ceiling must be exactly ${MAX_CONFIG_FILE_BYTES} bytes`);
  }
  const url = `${HUB}/${encodedRepository(repository)}/raw/${revision}/${encodedPath(path)}`;
  const response = await fetchWithRetry(url, 'application/octet-stream');
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > maxBytes) {
      throw new Error(`Pinned config exceeds bounded size before read: ${repository}@${revision}:${path}`);
    }
  }
  if (!response.body) throw new Error(`Pinned config response has no body: ${repository}@${revision}:${path}`);

  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('bounded config size exceeded');
        throw new Error(`Pinned config exceeds ${maxBytes} byte ceiling: ${repository}@${revision}:${path}`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
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
  if (!identity || identity.state !== 'PINNED' || identity.maxFileBytes !== MAX_CONFIG_FILE_BYTES || !Array.isArray(identity.files) || identity.files.length === 0) {
    throw new Error(`Pinned config identity is incomplete: ${repository}@${revision}`);
  }
  const paths = identity.files.map(file => file.path);
  if (new Set(paths).size !== paths.length) throw new Error(`Pinned config identity contains duplicate paths: ${repository}@${revision}`);

  let downloadedBytes = 0;
  for (const pinned of identity.files) {
    if (!Number.isSafeInteger(pinned.size) || pinned.size <= 0 || pinned.size > identity.maxFileBytes) {
      throw new Error(`Pinned config size is invalid: ${pinned.path}`);
    }
    if (!/^[0-9a-f]{64}$/.test(pinned.sha256)) throw new Error(`Pinned config SHA-256 is invalid: ${pinned.path}`);
    const bytes = await readPinnedConfigBytes(repository, revision, pinned.path, identity.maxFileBytes);
    if (bytes.byteLength !== pinned.size) {
      throw new Error(`Pinned config size drift: ${pinned.path}: manifest=${pinned.size} upstream=${bytes.byteLength}`);
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== pinned.sha256) {
      throw new Error(`Pinned config SHA-256 drift: ${pinned.path}: manifest=${pinned.sha256} upstream=${sha256}`);
    }
    downloadedBytes += bytes.byteLength;
  }
  return downloadedBytes;
}

await assertPinnedWeights(manifest.decoder.safeWeights, manifest.decoder.repository, manifest.decoder.revision);
await assertPinnedWeights(manifest.offlinePrior.safeWeights, manifest.offlinePrior.repository, manifest.offlinePrior.revision);
const decoderConfigBytes = await assertPinnedConfigs(manifest.decoder.requiredConfigIdentity, manifest.decoder.repository, manifest.decoder.revision);
const priorConfigBytes = await assertPinnedConfigs(manifest.offlinePrior.requiredConfigIdentity, manifest.offlinePrior.repository, manifest.offlinePrior.revision);

console.log(JSON.stringify({
  state: 'PASS',
  trustTransport: 'BOUNDED_GIT_LFS_POINTER_AND_PINNED_RAW_CONFIG_BYTES',
  decoder: {
    repository: manifest.decoder.repository,
    revision: manifest.decoder.revision,
    weightFiles: manifest.decoder.safeWeights.length,
    configFiles: manifest.decoder.requiredConfigIdentity.files.length,
  },
  offlinePrior: {
    repository: manifest.offlinePrior.repository,
    revision: manifest.offlinePrior.revision,
    weightFiles: manifest.offlinePrior.safeWeights.length,
    configFiles: manifest.offlinePrior.requiredConfigIdentity.files.length,
  },
  downloadedModelBytes: 0,
  downloadedConfigBytes: decoderConfigBytes + priorConfigBytes,
}, null, 2));
