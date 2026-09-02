export const MAX_LICENSE_EVIDENCE_BYTES = 256 * 1024;
const LICENSE_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9.+-]{0,63}$/;

export function assertPinnedLicenseEvidence(evidence, label = 'pinned license evidence') {
  if (
    !evidence
    || evidence.state !== 'PINNED_REVISION_METADATA'
    || evidence.path !== 'README.md'
    || evidence.maxFileBytes !== MAX_LICENSE_EVIDENCE_BYTES
    || typeof evidence.expectedIdentifier !== 'string'
    || !LICENSE_IDENTIFIER_PATTERN.test(evidence.expectedIdentifier)
    || evidence.expectedIdentifier !== evidence.expectedIdentifier.toLowerCase()
  ) {
    throw new Error(`${label} is incomplete or invalid`);
  }
  return evidence;
}

export async function readBoundedLicenseResponse(response, label, maxBytes = MAX_LICENSE_EVIDENCE_BYTES) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes !== MAX_LICENSE_EVIDENCE_BYTES) {
    throw new Error(`Pinned license evidence ceiling must be exactly ${MAX_LICENSE_EVIDENCE_BYTES} bytes`);
  }
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > maxBytes) {
      throw new Error(`Pinned license evidence exceeds bounded size before read: ${label}`);
    }
  }
  if (!response.body) throw new Error(`Pinned license evidence response has no body: ${label}`);

  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('bounded license evidence size exceeded').catch(() => {});
        throw new Error(`Pinned license evidence exceeds ${maxBytes} byte ceiling: ${label}`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export function assertPinnedLicenseBytes(evidence, bytes, label = 'pinned license evidence') {
  assertPinnedLicenseEvidence(evidence, label);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} must be valid UTF-8`);
  }
  if (text.includes('\0')) throw new Error(`${label} contains NUL bytes`);

  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) throw new Error(`${label} is missing model-card frontmatter`);
  const closing = normalized.indexOf('\n---\n', 4);
  if (closing < 0 || closing > 64 * 1024) throw new Error(`${label} has invalid or unbounded model-card frontmatter`);
  const frontmatter = normalized.slice(4, closing);
  const licenseLines = frontmatter
    .split('\n')
    .filter(line => /^license\s*:/.test(line));
  if (licenseLines.length !== 1) throw new Error(`${label} must contain exactly one top-level license field`);

  const match = licenseLines[0].match(/^license\s*:\s*([^#\s][^#]*?)\s*(?:#.*)?$/);
  if (!match) throw new Error(`${label} contains malformed license metadata`);
  const identifier = parseSimpleLicenseScalar(match[1].trim(), label).toLowerCase();
  if (!LICENSE_IDENTIFIER_PATTERN.test(identifier)) throw new Error(`${label} contains invalid license identifier`);
  if (identifier !== evidence.expectedIdentifier) {
    throw new Error(`${label} license drift: manifest=${evidence.expectedIdentifier} upstream=${identifier}`);
  }
  return Object.freeze({ identifier, path: evidence.path });
}

function parseSimpleLicenseScalar(raw, label) {
  if (!raw) throw new Error(`${label} contains malformed license metadata`);
  const first = raw[0];
  const last = raw[raw.length - 1];
  const firstQuoted = first === "'" || first === '"';
  const lastQuoted = last === "'" || last === '"';
  if (firstQuoted || lastQuoted) {
    if (!firstQuoted || !lastQuoted || first !== last || raw.length < 3) {
      throw new Error(`${label} contains malformed license metadata`);
    }
    const inner = raw.slice(1, -1);
    if (!inner || inner.includes(first)) throw new Error(`${label} contains malformed license metadata`);
    return inner;
  }
  return raw;
}
