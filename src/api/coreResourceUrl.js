const CANONICAL_CORE_PATH = '/api/core';
const CANONICAL_DELIVERY_PREFIX = `${CANONICAL_CORE_PATH}/`;

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
