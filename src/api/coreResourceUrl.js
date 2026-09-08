const CANONICAL_CORE_PATH = '/api/core';
const CANONICAL_DELIVERY_PREFIX = `${CANONICAL_CORE_PATH}/`;
export const CONFIGURED_CORE_API_ROOT = (import.meta.env ?? {}).VITE_CORE_API_URL || CANONICAL_CORE_PATH;

/**
 * Resolve only Core-owned root-relative resources when the browser and Core use
 * different origins. Same-origin deployments preserve the server-issued path.
 * Absolute, blob/data, non-Core, malformed and non-canonical values are never
 * rewritten by the browser.
 */
export function resolveCoreResourceUrl(value, apiRoot = CANONICAL_CORE_PATH) {
  if (typeof value !== 'string' || !value.startsWith(CANONICAL_DELIVERY_PREFIX)) return value;

  const configured = String(apiRoot || CANONICAL_CORE_PATH).trim();
  if (configured === CANONICAL_CORE_PATH || configured.startsWith('/')) return value;

  let root;
  try { root = new URL(configured); }
  catch { return value; }

  if (!['http:', 'https:'].includes(root.protocol)) return value;
  if (root.username || root.password || root.search || root.hash || root.pathname !== CANONICAL_CORE_PATH) return value;
  return `${root.origin}${value}`;
}

/**
 * Recover the canonical root-relative Core resource path from a browser display
 * URL without trusting arbitrary absolute origins. Absolute values are accepted
 * only when they are byte-for-byte the URL produced for that same path by the
 * configured Core API root. Invalid roots, credentials, foreign origins and
 * non-Core paths return null rather than widening browser display authority.
 */
export function canonicalCoreResourcePath(value, apiRoot = CONFIGURED_CORE_API_ROOT) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return null;
  if (value.startsWith(CANONICAL_DELIVERY_PREFIX)) return value;

  let parsed;
  try { parsed = new URL(value); }
  catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;

  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (!path.startsWith(CANONICAL_DELIVERY_PREFIX)) return null;
  return resolveCoreResourceUrl(path, apiRoot) === value ? path : null;
}

export function normalizeProjectResourceUrls(project, apiRoot = CANONICAL_CORE_PATH) {
  if (!project || typeof project !== 'object') return project;
  const versions = Array.isArray(project.versions)
    ? project.versions.map(version => {
      if (!version || typeof version !== 'object') return version;
      return {
        ...version,
        preview_url: resolveCoreResourceUrl(version.preview_url, apiRoot),
      };
    })
    : project.versions;
  return {
    ...project,
    current_image_url: resolveCoreResourceUrl(project.current_image_url, apiRoot),
    original_image_url: resolveCoreResourceUrl(project.original_image_url, apiRoot),
    thumbnail_url: resolveCoreResourceUrl(project.thumbnail_url, apiRoot),
    versions,
  };
}
