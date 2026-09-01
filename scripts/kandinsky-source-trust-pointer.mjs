const SHA256 = /^[0-9a-f]{64}$/;
export const MAX_SOURCE_POINTER_BYTES = 4096;

export function parseSourcePointer(text, label = 'source pointer') {
  if (typeof text !== 'string') throw new Error(`${label} must be UTF-8 text`);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes < 1 || bytes > MAX_SOURCE_POINTER_BYTES) {
    throw new Error(`${label} exceeds bounded pointer size`);
  }
  if (text.includes('\0') || /<html[\s>]/i.test(text)) throw new Error(`${label} is not a Git LFS pointer`);

  const lines = text.replace(/\r\n/g, '\n').split('\n').map(line => line.trim()).filter(Boolean);
  const versions = lines.filter(line => line.startsWith('version '));
  const oids = lines.filter(line => line.startsWith('oid '));
  const sizes = lines.filter(line => line.startsWith('size '));
  if (versions.length !== 1 || versions[0] !== 'version https://git-lfs.github.com/spec/v1') {
    throw new Error(`${label} has invalid Git LFS version`);
  }
  if (oids.length !== 1) throw new Error(`${label} must contain exactly one oid`);
  if (sizes.length !== 1) throw new Error(`${label} must contain exactly one size`);

  const oidMatch = oids[0].match(/^oid sha256:([0-9a-fA-F]{64})$/);
  if (!oidMatch) throw new Error(`${label} must contain one sha256 content oid`);
  const sha256 = oidMatch[1].toLowerCase();
  if (!SHA256.test(sha256)) throw new Error(`${label} has invalid sha256 content oid`);

  const sizeMatch = sizes[0].match(/^size ([1-9][0-9]*)$/);
  if (!sizeMatch) throw new Error(`${label} has invalid positive size`);
  const size = Number(sizeMatch[1]);
  if (!Number.isSafeInteger(size) || size < 1) throw new Error(`${label} size is not a positive safe integer`);

  return Object.freeze({ sha256, size });
}

export async function readBoundedPointerText(response, label = 'source pointer') {
  const declared = response.headers?.get?.('content-length');
  if (declared != null && declared !== '') {
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_SOURCE_POINTER_BYTES) {
      throw new Error(`${label} response exceeds bounded pointer size`);
    }
  }
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_SOURCE_POINTER_BYTES) throw new Error(`${label} response exceeds bounded pointer size`);
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SOURCE_POINTER_BYTES) {
        await reader.cancel('bounded pointer limit exceeded').catch(() => {});
        throw new Error(`${label} response exceeds bounded pointer size`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
