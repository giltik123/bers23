const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_DIMENSION = 8192;
const MAX_PIXELS = 40_000_000;
const MAX_DECODED_BYTES = 160 * 1024 * 1024;
const SOURCE_TIMEOUT_MS = 15_000;
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type TrustedImage = {
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
};

/** Builds an exact-match host allowlist exclusively from deployment configuration. */
export function trustedAssetHosts(env: { get(name: string): string | undefined }): Set<string> {
  const configured = [
    env.get('BASE44_ASSET_HOST'),
    env.get('R2_ASSET_HOST'),
    env.get('S3_ASSET_HOST'),
    env.get('TRUSTED_ASSET_HOSTS'),
  ];
  const hosts = configured
    .flatMap((value) => (value || '').split(','))
    .map(normalizeHost)
    .filter(Boolean);
  return new Set(hosts);
}

/** Validates an asset URL without accepting redirects or wildcard host suffixes. */
export function validateAssetUrl(value: unknown, allowedHosts: ReadonlySet<string>): URL {
  if (!allowedHosts.size) throw new Error('Trusted asset hosts are not configured');
  if (typeof value !== 'string') throw new Error('image_url must be a valid HTTPS URL');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('image_url must be a valid HTTPS URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || !allowedHosts.has(normalizeHost(url.hostname))) {
    throw new Error('image_url host is not trusted');
  }
  return url;
}

/** Downloads and inspects a trusted image before any decoder or AI provider sees it. */
export async function loadTrustedImage(value: unknown, allowedHosts: ReadonlySet<string>): Promise<TrustedImage> {
  const url = validateAssetUrl(value, allowedHosts);
  let response: Response;
  try {
    response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
  } catch {
    throw new Error('Could not load prepared image');
  }
  if (!response.ok || !response.body) throw new Error('Could not load prepared image');

  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() || '';
  if (!SUPPORTED_TYPES.has(contentType)) {
    await response.body.cancel();
    throw new Error('Unsupported image format; use JPEG, PNG or WebP');
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_SOURCE_BYTES) {
    await response.body.cancel();
    throw new Error('Prepared image is too large');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new Error('Prepared image is too large');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const dimensions = inspectImage(bytes, contentType);
  return { bytes, contentType, ...dimensions };
}

/** Reads dimensions from encoded headers and rejects decompression/image bombs. */
export function inspectImage(bytes: Uint8Array, contentType: string): { width: number; height: number } {
  let dimensions: { width: number; height: number; channels: number } | null = null;
  if (contentType === 'image/png') dimensions = inspectPng(bytes);
  if (contentType === 'image/jpeg') dimensions = inspectJpeg(bytes);
  if (contentType === 'image/webp') dimensions = inspectWebp(bytes);
  if (!dimensions) throw new Error('Image content does not match its declared format');

  const { width, height, channels } = dimensions;
  const pixels = width * height;
  const decodedBytes = pixels * channels;
  if (!Number.isSafeInteger(pixels) || width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION || pixels > MAX_PIXELS || decodedBytes > MAX_DECODED_BYTES) {
    throw new Error('Image dimensions exceed safe processing limits');
  }
  return { width, height };
}

function inspectPng(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 29 || !signature.every((value, index) => bytes[index] === value) || ascii(bytes, 12, 16) !== 'IHDR') return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const validChannels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  if (!validChannels || ![1, 2, 4, 8, 16].includes(bitDepth)) return null;
  // Decoders commonly expand PNGs to RGBA; 16-bit PNGs can require 8 bytes/pixel.
  return { width, height, channels: bitDepth === 16 ? 8 : 4 };
}

function inspectJpeg(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset++] !== 0xff) continue;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > bytes.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (sofMarkers.has(marker) && length >= 8) {
      return { height: view.getUint16(offset + 3), width: view.getUint16(offset + 5), channels: bytes[offset + 7] || 4 };
    }
    offset += length;
  }
  return null;
}

function inspectWebp(bytes: Uint8Array) {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 12) !== 'WEBP') return null;
  const chunk = ascii(bytes, 12, 16);
  if (chunk === 'VP8X') {
    return { width: uint24(bytes, 24) + 1, height: uint24(bytes, 27) + 1, channels: 4 };
  }
  if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { width: (bytes[26] | bytes[27] << 8) & 0x3fff, height: (bytes[28] | bytes[29] << 8) & 0x3fff, channels: 4 };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
      channels: 4,
    };
  }
  return null;
}

function uint24(bytes: Uint8Array, offset: number) {
  return bytes[offset] | bytes[offset + 1] << 8 | bytes[offset + 2] << 16;
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/\.$/, '');
}
