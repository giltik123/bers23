const READINESS_STATUSES = new Set([
  'READY', 'SOURCE_UNAVAILABLE', 'STALE_SOURCE', 'GARMENT_UNAVAILABLE', 'GARMENT_UNSUPPORTED',
  'REPRESENTATION_REQUIRED', 'REPRESENTATION_AMBIGUOUS', 'BODY_ANCHORS_REQUIRED',
  'BODY_ANCHORS_AMBIGUOUS', 'EVIDENCE_INVALID',
]);
const CONTINUATION_STATUSES = new Set([
  'WARP_PENDING', 'TEXTURE_NOT_EXECUTED', 'TEXTURE_NOT_PREPARED',
  'TEXTURE_PENDING', 'TEXTURE_FAILED', 'TEXTURE_STALE',
]);
const SUPPORTED_GROUPS = new Set(['tops', 'bottoms', 'dresses', 'footwear']);
const KNOWN_GROUPS = new Set([...SUPPORTED_GROUPS, 'accessories', 'other']);

/**
 * Pure UI policy for explicit canonical Try-On product controls.
 *
 * This layer never infers readiness, retries, advances orchestration, or owns
 * execution identity. It only decides which already-accepted user actions may
 * be rendered from a safe controller result + host snapshot.
 */
export function canonicalTryOnProductUiState({ result = null, host, busy = false, disabled = false } = {}) {
  const safeHost = normalizeHost(host);
  if (typeof busy !== 'boolean' || typeof disabled !== 'boolean') throw new TypeError('Try-On UI busy/disabled flags must be boolean');
  const safeResult = normalizeResult(result);
  const interactionBlocked = busy || disabled || safeHost.busy;
  const continuation = safeResult && CONTINUATION_STATUSES.has(safeResult.status);
  const ready = safeResult?.status === 'READINESS' && safeResult.readiness.status === 'READY';

  return Object.freeze({
    status: safeResult?.status ?? 'UNCHECKED',
    message: messageFor(safeResult),
    readiness: safeResult?.readiness ?? null,
    canInspect: !interactionBlocked && !safeHost.hasInFlight,
    canRun: !interactionBlocked && !safeHost.hasInFlight && ready,
    canResume: !interactionBlocked && safeHost.hasInFlight && continuation,
    canRecover: !interactionBlocked && safeHost.hasInFlight && continuation,
    canAbandon: !interactionBlocked && safeHost.hasInFlight,
    hasInFlight: safeHost.hasInFlight,
  });
}

function normalizeResult(value) {
  if (value === null || value === undefined) return null;
  requirePlainObject(value, 'Try-On UI result');
  if (value.status === 'READINESS' || value.status === 'BLOCKED') {
    requireExactKeys(value, ['readiness', 'status'], 'Try-On UI readiness result');
    return Object.freeze({ status: value.status, readiness: normalizeReadiness(value.readiness) });
  }
  if (!CONTINUATION_STATUSES.has(value.status)) throw new Error('Try-On UI received an unknown or non-displayable product status');
  requireExactKeys(value, ['status'], 'Try-On UI continuation result');
  return Object.freeze({ status: value.status });
}

function normalizeReadiness(value) {
  requirePlainObject(value, 'Try-On UI readiness');
  const expected = value.categoryGroup === undefined
    ? ['entryId', 'garmentId', 'status']
    : ['categoryGroup', 'entryId', 'garmentId', 'status'];
  requireExactKeys(value, expected, 'Try-On UI readiness');
  if (typeof value.entryId !== 'string' || !value.entryId) throw new TypeError('Try-On UI readiness entryId is unavailable');
  if (typeof value.garmentId !== 'string' || !value.garmentId) throw new TypeError('Try-On UI readiness garmentId is unavailable');
  if (!READINESS_STATUSES.has(value.status)) throw new Error('Try-On UI readiness status is unknown');
  if (value.categoryGroup !== undefined && !KNOWN_GROUPS.has(value.categoryGroup)) throw new Error('Try-On UI category group is unknown');
  if (value.status === 'READY' && !SUPPORTED_GROUPS.has(value.categoryGroup)) {
    throw new Error('Try-On UI READY requires a supported category group');
  }
  return Object.freeze({
    entryId: value.entryId,
    garmentId: value.garmentId,
    status: value.status,
    ...(value.categoryGroup === undefined ? {} : { categoryGroup: value.categoryGroup }),
  });
}

function normalizeHost(value) {
  requirePlainObject(value, 'Try-On UI host snapshot');
  requireExactKeys(value, ['active', 'busy', 'disposed', 'hasInFlight', 'phase'], 'Try-On UI host snapshot');
  for (const key of ['active', 'busy', 'disposed', 'hasInFlight']) {
    if (typeof value[key] !== 'boolean') throw new TypeError(`Try-On UI host ${key} must be boolean`);
  }
  if (typeof value.phase !== 'string' || !value.phase) throw new TypeError('Try-On UI host phase is unavailable');
  if (value.disposed) throw new Error('Try-On UI cannot render a disposed Editor host');
  return value;
}

function messageFor(result) {
  if (!result) return 'Check readiness before running deterministic Try-On.';
  if (result.status === 'READINESS' || result.status === 'BLOCKED') {
    return readinessMessage(result.readiness.status);
  }
  switch (result.status) {
    case 'WARP_PENDING': return 'Garment warp is still pending. Resume or recover explicitly.';
    case 'TEXTURE_NOT_EXECUTED': return 'Texture execution has not run. Resume explicitly to continue.';
    case 'TEXTURE_NOT_PREPARED': return 'Texture preparation is not ready. Resume or recover explicitly.';
    case 'TEXTURE_PENDING': return 'Texture result is pending. Resume or recover explicitly.';
    case 'TEXTURE_FAILED': return 'Texture execution failed. Recover the canonical result or resume explicitly.';
    case 'TEXTURE_STALE': return 'Texture continuation is stale. Recover before deciding whether to resume.';
    default: throw new Error('Try-On UI message status is unknown');
  }
}

function readinessMessage(status) {
  switch (status) {
    case 'READY': return 'Deterministic Try-On prerequisites are ready.';
    case 'SOURCE_UNAVAILABLE': return 'The current canonical project source is unavailable.';
    case 'STALE_SOURCE': return 'The project source changed. Refresh before Try-On.';
    case 'GARMENT_UNAVAILABLE': return 'The selected managed Garment is unavailable.';
    case 'GARMENT_UNSUPPORTED': return 'This Garment category is not supported by deterministic Try-On.';
    case 'REPRESENTATION_REQUIRED': return 'A manual garment outline is required before Try-On.';
    case 'REPRESENTATION_AMBIGUOUS': return 'Garment representation is ambiguous and must be resolved before Try-On.';
    case 'BODY_ANCHORS_REQUIRED': return 'Manual project body anchors are required before Try-On.';
    case 'BODY_ANCHORS_AMBIGUOUS': return 'Project body anchors are ambiguous and must be resolved before Try-On.';
    case 'EVIDENCE_INVALID': return 'Try-On prerequisite evidence is invalid. Refresh canonical state before retrying.';
    default: throw new Error('Try-On UI readiness message status is unknown');
  }
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
}

function requireExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unknown or missing fields`);
  }
}
