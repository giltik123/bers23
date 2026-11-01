// Navigation hints only: Core remains the sole authority for Project access.
// Never use browser route parameters as proof of Project ownership.
const SAFE_PROJECT_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function readProjectNavigationContext(pathname, search = '') {
  const key = pathname === '/editor' ? 'id'
    : (pathname === '/wardrobe' || pathname === '/assets' ? 'project' : null);
  if (!key) return null;
  const value = new URLSearchParams(search).get(key);
  return typeof value === 'string' && SAFE_PROJECT_ID.test(value) ? value : null;
}

export function projectNavigationTargets(projectId, pathname) {
  if (typeof projectId !== 'string' || !SAFE_PROJECT_ID.test(projectId)) {
    return Object.freeze({ workspace: null, assets: '/assets' });
  }
  const encoded = encodeURIComponent(projectId);
  return Object.freeze({
    workspace: `/editor?id=${encoded}${pathname === '/wardrobe' ? '&mode=fashion' : ''}`,
    assets: `/assets?project=${encoded}`,
  });
}
