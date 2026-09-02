import { createHash } from 'node:crypto';

export const MAX_CONFIG_FILE_BYTES = 5 * 1024 * 1024;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function assertPinnedRevision(repository, revision) {
  if (!/^[0-9a-f]{40}$/i.test(revision)) {
    throw new Error(`Pinned Hugging Face revision must be a 40-hex commit: ${repository}@${revision}`);
  }
}

export function assertPinnedConfigIdentity(identity, label = 'pinned config identity') {
  if (!identity || identity.state !== 'PINNED' || identity.maxFileBytes !== MAX_CONFIG_FILE_BYTES || !Array.isArray(identity.files) || identity.files.length === 0) {
    throw new Error(`${label} is incomplete`);
  }
  const paths = identity.files.map(file => file.path);
  if (new Set(paths).size !== paths.length) throw new Error(`${label} contains duplicate paths`);
  for (const file of identity.files) {
    if (typeof file.path !== 'string' || file.path.length === 0 || file.path.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error(`${label} contains invalid path`);
    }
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > identity.maxFileBytes) {
      throw new Error(`${label} contains invalid size: ${file.path}`);
    }
    if (!SHA256_PATTERN.test(file.sha256)) throw new Error(`${label} contains invalid SHA-256: ${file.path}`);
  }
  return identity;
}

export async function retryBoundedTrustRead(operation, {
  label = 'bounded trust read',
  maxAttempts = 4,
  backoffMs = 750,
  shouldRetry = () => true,
} = {}) {
  if (typeof operation !== 'function') throw new Error('Bounded trust read operation must be callable');
  if (typeof shouldRetry !== 'function') throw new Error('Bounded trust read retry predicate must be callable');
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 8) {
    throw new Error('Bounded trust read maxAttempts must be an integer between 1 and 8');
  }
  if (!Number.isSafeInteger(backoffMs) || backoffMs < 0 || backoffMs > 10_000) {
    throw new Error('Bounded trust read backoffMs must be an integer between 0 and 10000');
  }

  let last;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      last = error;
      if (!shouldRetry(error)) throw error;
      if (attempt < maxAttempts && backoffMs > 0) {
        await new Promise(resolve => setTimeout(resolve, attempt * backoffMs));
      }
    }
  }
  throw new Error(
    `${label} failed after ${maxAttempts} attempts: ${last instanceof Error ? last.message : String(last)}`,
    { cause: last },
  );
}

export async function readBoundedConfigResponse(response, label, maxBytes = MAX_CONFIG_FILE_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes !== MAX_CONFIG_FILE_BYTES) {
    throw new Error(`Pinned config ceiling must be exactly ${MAX_CONFIG_FILE_BYTES} bytes`);
  }
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > maxBytes) {
      throw new Error(`Pinned config exceeds bounded size before read: ${label}`);
    }
  }
  if (!response.body) throw new Error(`Pinned config response has no body: ${label}`);

  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('bounded config size exceeded').catch(() => {});
        throw new Error(`Pinned config exceeds ${maxBytes} byte ceiling: ${label}`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export function assertPinnedConfigBytes(pinned, bytes) {
  if (!Number.isSafeInteger(pinned?.size) || pinned.size <= 0 || pinned.size > MAX_CONFIG_FILE_BYTES) {
    throw new Error(`Pinned config size is invalid: ${pinned?.path ?? '<unknown>'}`);
  }
  if (!SHA256_PATTERN.test(pinned?.sha256 ?? '')) throw new Error(`Pinned config SHA-256 is invalid: ${pinned?.path ?? '<unknown>'}`);
  if (bytes.byteLength !== pinned.size) {
    throw new Error(`Pinned config size drift: ${pinned.path}: manifest=${pinned.size} upstream=${bytes.byteLength}`);
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== pinned.sha256) {
    throw new Error(`Pinned config SHA-256 drift: ${pinned.path}: manifest=${pinned.sha256} upstream=${sha256}`);
  }
  return Object.freeze({ size: bytes.byteLength, sha256 });
}
