/**
 * Fail-closed local photo transport. Core may omit Content-Length or send a
 * compressed body, so relying on that header or response.blob() alone could
 * allocate unbounded memory before the 32 MB image limit is checked.
 *
 * This module never performs a fetch, chooses an origin, stores a credential,
 * caches pixels, or posts anything to Core. Caller must authenticate and
 * validate canonical same-origin image URL before passing a Response.
 */
export const MAX_LOCAL_DOWNLOAD_BYTES = 32 * 1024 * 1024;
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

export async function readBoundedLocalImageResponse(response, mime, limit = MAX_LOCAL_DOWNLOAD_BYTES) {
  if (!IMAGE_MIME.has(mime)) throw new Error('Unsupported local photo MIME type');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LOCAL_DOWNLOAD_BYTES) {
    throw new Error('Invalid local photo download limit');
  }
  if (!response || !response.body || typeof response.body.getReader !== 'function') {
    throw new Error('Streaming image download is unavailable; refusing an unbounded file');
  }
  const advertised = response.headers?.get?.('content-length');
  if (advertised != null && /^[0-9]+$/.test(advertised) && Number(advertised) > limit) {
    throw new Error('Core image exceeds the local 32 MB input limit');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) {
        throw new Error('Core image stream returned invalid binary data');
      }
      total += value.byteLength;
      if (total > limit) {
        throw new Error('Core image exceeds the local 32 MB input limit');
      }
      if (value.byteLength) chunks.push(value);
    }
    if (total === 0) throw new Error('Core image response is empty');
    const blob = new Blob(chunks, { type: mime });
    if (blob.size !== total) throw new Error('Core image download size mismatch');
    return blob;
  } catch (error) {
    // Abandon the network body immediately on size/corruption/abort failure.
    try { await reader.cancel(); } catch { /* already aborted by caller */ }
    throw error;
  } finally {
    try { reader.releaseLock(); } catch { /* stream already closed */ }
  }
}
