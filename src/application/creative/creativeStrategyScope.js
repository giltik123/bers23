export function scopeCreativeStrategyToProject(strategy, projectId) {
  if (!strategy || typeof strategy !== 'object' || Array.isArray(strategy)) {
    throw new TypeError('Creative strategy must be an object');
  }
  if (typeof strategy.id !== 'string' || !strategy.id.trim()) {
    throw new TypeError('Creative strategy ID is required');
  }
  if (typeof projectId !== 'string') {
    throw new TypeError('Canonical Project ID is required');
  }

  const normalizedProjectId = projectId.normalize('NFKC').trim();
  if (
    !normalizedProjectId
    || normalizedProjectId.length > 256
    || /[\\u0000-\\u001f\\u007f]/u.test(normalizedProjectId)
  ) {
    throw new TypeError('Canonical Project ID must be a bounded printable identifier');
  }

  return Object.freeze({
    ...strategy,
    id: `${strategy.id}:project:${encodeURIComponent(normalizedProjectId)}`,
  });
}

export function savedCreativeStrategyForCurrent(saved, savedStrategy, currentStrategy) {
  if (
    !saved
    || !currentStrategy
    || savedStrategy !== currentStrategy
    || saved.id !== currentStrategy.id
  ) {
    return null;
  }
  return saved;
}
