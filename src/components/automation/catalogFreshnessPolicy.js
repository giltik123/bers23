// UI-only freshness guard. Core remains the authority for every mutation.
export function canMutateAutomationCatalog(fresh, busy) {
  return fresh === true && busy === false;
}

// A successful refresh must not retain IDs deleted or revoked server-side.
export function reconcileCatalogSelection(currentId, items) {
  return items.some(item => item.id === currentId) ? currentId : (items[0]?.id || '');
}
