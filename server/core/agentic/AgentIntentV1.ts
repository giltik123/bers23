import { createHash } from 'node:crypto';

export const AGENT_INTENT_V1_SCHEMA = 'BERS_AGENT_INTENT_V1' as const;
export const AGENT_INTENT_V1_DIGEST_VERSION = '1' as const;
const DIGEST_DOMAIN = `bers:aee:agent-intent:v${AGENT_INTENT_V1_DIGEST_VERSION}\0`;

const MODALITIES = Object.freeze(['TEXT', 'VOICE', 'TOUCH', 'IMAGE'] as const);
const TARGET_KINDS = Object.freeze(['GARMENT', 'PERSON', 'SELECTED_REGION', 'SELECTED_OBJECT', 'PRIOR_CANDIDATE'] as const);
const PROJECT_TARGET_KINDS = new Set<string>(['PERSON', 'SELECTED_REGION', 'SELECTED_OBJECT', 'PRIOR_CANDIDATE']);
const REGION_KINDS = Object.freeze(['FACE', 'HAIR', 'HANDS', 'BACKGROUND', 'LOGO', 'REGION', 'OBJECT', 'TARGET'] as const);
const QUALITY_LEVELS = Object.freeze(['FAST', 'BALANCED', 'QUALITY', 'ULTRA'] as const);
const EXECUTION_POLICIES = Object.freeze(['LOCAL_ONLY', 'LOCAL_FIRST', 'AUTO'] as const);
const EVIDENCE_KINDS = Object.freeze(['UI_SELECTION', 'PROJECT_STATE', 'USER_EXPLICIT', 'MODEL_ADVISORY', 'PRIOR_CANDIDATE'] as const);

export type AgentIntentSourceModalityV1 = typeof MODALITIES[number];
export type AgentIntentTargetKindV1 = typeof TARGET_KINDS[number];
export type AgentIntentRegionKindV1 = typeof REGION_KINDS[number];
export type AgentIntentQualityV1 = typeof QUALITY_LEVELS[number];
export type AgentIntentExecutionPolicyV1 = typeof EXECUTION_POLICIES[number];
export type AgentIntentEvidenceKindV1 = typeof EVIDENCE_KINDS[number];

export type AgentIntentTargetReferenceV1 = Readonly<{
  kind: AgentIntentTargetKindV1;
  id: string;
  scope: 'PROJECT' | 'OWNER';
  projectId?: string;
  projectRevision?: number;
}>;

export type AgentIntentRegionReferenceV1 = Readonly<{
  kind: AgentIntentRegionKindV1;
  id: string;
  projectId: string;
  projectRevision: number;
}>;

export type AgentIntentEvidenceV1 = Readonly<{
  kind: AgentIntentEvidenceKindV1;
  ref: string;
  sha256?: string;
}>;

export type AgentIntentAmbiguityV1 = Readonly<{
  code: string;
  fieldPath: string;
  candidateIds: readonly string[];
  confidence: number;
}>;

export type AgentIntentV1 = Readonly<{
  schemaVersion: typeof AGENT_INTENT_V1_SCHEMA;
  parserVersion: string;
  goal: Readonly<{
    capability: string;
    instruction: string;
  }>;
  source: Readonly<{
    projectId: string;
    projectRevision: number;
    sourceRef: string;
  }>;
  targets: readonly AgentIntentTargetReferenceV1[];
  mutable: readonly AgentIntentRegionReferenceV1[];
  preserve: readonly AgentIntentRegionReferenceV1[];
  constraints: Readonly<{
    quality: AgentIntentQualityV1;
    styleTags: readonly string[];
  }>;
  execution: Readonly<{
    policy: AgentIntentExecutionPolicyV1;
    cloudAllowed: boolean;
    maxNodes: number;
    maxRetries: number;
    maxReplans: number;
    maxCandidates: number;
    maxPaidCredits: number;
    maxWallClockMs: number;
    maxMemoryBytes: number;
  }>;
  context: Readonly<{
    modalities: readonly AgentIntentSourceModalityV1[];
    uiReferences: readonly AgentIntentTargetReferenceV1[];
  }>;
  ambiguities: readonly AgentIntentAmbiguityV1[];
  evidence: readonly AgentIntentEvidenceV1[];
  confidence: number;
}>;

export type AgentIntentCanonicalContextV1 = Readonly<{
  projectId: string;
  projectRevision: number;
  sourceRef: string;
}>;

export class AgentIntentV1Error extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'AgentIntentV1Error';
  }
}

const ROOT_KEYS = Object.freeze([
  'schemaVersion', 'parserVersion', 'goal', 'source', 'targets', 'mutable', 'preserve',
  'constraints', 'execution', 'context', 'ambiguities', 'evidence', 'confidence',
]);
const GOAL_KEYS = Object.freeze(['capability', 'instruction']);
const SOURCE_KEYS = Object.freeze(['projectId', 'projectRevision', 'sourceRef']);
const TARGET_KEYS = Object.freeze(['kind', 'id', 'scope', 'projectId', 'projectRevision']);
const REGION_KEYS = Object.freeze(['kind', 'id', 'projectId', 'projectRevision']);
const CONSTRAINT_KEYS = Object.freeze(['quality', 'styleTags']);
const EXECUTION_KEYS = Object.freeze([
  'policy', 'cloudAllowed', 'maxNodes', 'maxRetries', 'maxReplans', 'maxCandidates',
  'maxPaidCredits', 'maxWallClockMs', 'maxMemoryBytes',
]);
const CONTEXT_KEYS = Object.freeze(['modalities', 'uiReferences']);
const AMBIGUITY_KEYS = Object.freeze(['code', 'fieldPath', 'candidateIds', 'confidence']);
const EVIDENCE_KEYS = Object.freeze(['kind', 'ref', 'sha256']);

/**
 * AE-1 canonical boundary. The returned value is deep-frozen advisory intent.
 * It does not resolve capability admission, model/provider routing, Artifact identity,
 * Billing authority, execution state or Project mutation.
 */
export function normalizeAgentIntentV1(raw: unknown): AgentIntentV1 {
  const root = exactRecord(raw, ROOT_KEYS, ROOT_KEYS, 'agent_intent_invalid_root');
  if (root.schemaVersion !== AGENT_INTENT_V1_SCHEMA) fail('agent_intent_schema_unsupported', `schemaVersion must be ${AGENT_INTENT_V1_SCHEMA}`);

  const goalRecord = exactRecord(root.goal, GOAL_KEYS, GOAL_KEYS, 'agent_intent_invalid_goal');
  const sourceRecord = exactRecord(root.source, SOURCE_KEYS, SOURCE_KEYS, 'agent_intent_invalid_source');
  const constraintsRecord = exactRecord(root.constraints, CONSTRAINT_KEYS, CONSTRAINT_KEYS, 'agent_intent_invalid_constraints');
  const executionRecord = exactRecord(root.execution, EXECUTION_KEYS, EXECUTION_KEYS, 'agent_intent_invalid_execution');
  const contextRecord = exactRecord(root.context, CONTEXT_KEYS, CONTEXT_KEYS, 'agent_intent_invalid_context');

  const source = Object.freeze({
    projectId: boundedIdentifier(sourceRecord.projectId, 'source.projectId'),
    projectRevision: boundedInteger(sourceRecord.projectRevision, 'source.projectRevision', 0, Number.MAX_SAFE_INTEGER),
    sourceRef: boundedIdentifier(sourceRecord.sourceRef, 'source.sourceRef'),
  });

  const policy = enumValue(executionRecord.policy, EXECUTION_POLICIES, 'execution.policy');
  const cloudAllowed = booleanValue(executionRecord.cloudAllowed, 'execution.cloudAllowed');
  const maxPaidCredits = boundedInteger(executionRecord.maxPaidCredits, 'execution.maxPaidCredits', 0, 1_000_000);
  if (policy === 'LOCAL_ONLY' && (cloudAllowed || maxPaidCredits !== 0)) {
    fail('agent_intent_local_only_violation', 'LOCAL_ONLY intent must set cloudAllowed=false and maxPaidCredits=0');
  }

  const normalized: AgentIntentV1 = {
    schemaVersion: AGENT_INTENT_V1_SCHEMA,
    parserVersion: boundedText(root.parserVersion, 'parserVersion', 1, 120, false),
    goal: Object.freeze({
      capability: capabilityId(goalRecord.capability),
      instruction: boundedText(goalRecord.instruction, 'goal.instruction', 1, 4_000, true),
    }),
    source,
    targets: normalizeArray(root.targets, 'targets', 32, normalizeTargetReference),
    mutable: normalizeArray(root.mutable, 'mutable', 32, normalizeRegionReference),
    preserve: normalizeArray(root.preserve, 'preserve', 32, normalizeRegionReference),
    constraints: Object.freeze({
      quality: enumValue(constraintsRecord.quality, QUALITY_LEVELS, 'constraints.quality'),
      styleTags: normalizeStringSet(constraintsRecord.styleTags, 'constraints.styleTags', 32, 80),
    }),
    execution: Object.freeze({
      policy,
      cloudAllowed,
      maxNodes: boundedInteger(executionRecord.maxNodes, 'execution.maxNodes', 1, 32),
      maxRetries: boundedInteger(executionRecord.maxRetries, 'execution.maxRetries', 0, 8),
      maxReplans: boundedInteger(executionRecord.maxReplans, 'execution.maxReplans', 0, 8),
      maxCandidates: boundedInteger(executionRecord.maxCandidates, 'execution.maxCandidates', 1, 16),
      maxPaidCredits,
      maxWallClockMs: boundedInteger(executionRecord.maxWallClockMs, 'execution.maxWallClockMs', 1_000, 86_400_000),
      maxMemoryBytes: boundedInteger(executionRecord.maxMemoryBytes, 'execution.maxMemoryBytes', 1_048_576, 137_438_953_472),
    }),
    context: Object.freeze({
      modalities: normalizeEnumSet(contextRecord.modalities, MODALITIES, 'context.modalities', 4),
      uiReferences: normalizeArray(contextRecord.uiReferences, 'context.uiReferences', 64, normalizeTargetReference),
    }),
    ambiguities: normalizeArray(root.ambiguities, 'ambiguities', 32, normalizeAmbiguity),
    evidence: normalizeArray(root.evidence, 'evidence', 64, normalizeEvidence),
    confidence: confidenceValue(root.confidence, 'confidence'),
  };

  return deepFreeze(normalized);
}

/** Deterministic key-order-independent bytes for an already normalized AgentIntentV1. */
export function serializeAgentIntentV1(intent: AgentIntentV1): string {
  const normalized = normalizeAgentIntentV1(intent);
  return JSON.stringify(canonicalValue(normalized));
}

/** Domain-separated SHA-256 identity for replay/debugging and later compiler binding. */
export function agentIntentV1Digest(intent: AgentIntentV1): string {
  return createHash('sha256').update(DIGEST_DOMAIN).update(serializeAgentIntentV1(intent)).digest('hex');
}

/**
 * Core-context stale/substitution guard. This does not mint source truth: callers must
 * obtain `context` from canonical Project authority immediately before compilation.
 */
export function assertAgentIntentV1CanonicalContext(
  intent: AgentIntentV1,
  context: AgentIntentCanonicalContextV1,
): AgentIntentV1 {
  const normalized = normalizeAgentIntentV1(intent);
  const expectedProjectId = boundedIdentifier(context?.projectId, 'canonicalContext.projectId');
  const expectedProjectRevision = boundedInteger(context?.projectRevision, 'canonicalContext.projectRevision', 0, Number.MAX_SAFE_INTEGER);
  const expectedSourceRef = boundedIdentifier(context?.sourceRef, 'canonicalContext.sourceRef');

  if (normalized.source.projectId !== expectedProjectId) fail('agent_intent_cross_project', 'Intent source project does not match canonical Project');
  if (normalized.source.projectRevision !== expectedProjectRevision) fail('agent_intent_stale_project', 'Intent Project revision is stale');
  if (normalized.source.sourceRef !== expectedSourceRef) fail('agent_intent_stale_source', 'Intent source reference is stale');

  const projectReferences = [
    ...normalized.targets,
    ...normalized.mutable,
    ...normalized.preserve,
    ...normalized.context.uiReferences,
  ];
  for (const reference of projectReferences) {
    if ('scope' in reference && reference.scope === 'OWNER') continue;
    if (reference.projectId !== expectedProjectId) fail('agent_intent_cross_project_reference', 'Intent contains a cross-project reference');
    if (reference.projectRevision !== expectedProjectRevision) fail('agent_intent_stale_reference', 'Intent contains a stale Project reference');
  }
  return normalized;
}

export function agentIntentV1RequiresClarification(intent: AgentIntentV1): boolean {
  return normalizeAgentIntentV1(intent).ambiguities.length > 0;
}

function normalizeTargetReference(raw: unknown, index: number, path: string): AgentIntentTargetReferenceV1 {
  const record = exactRecord(raw, TARGET_KEYS, ['kind', 'id', 'scope'], `${path}[${index}]`);
  const kind = enumValue(record.kind, TARGET_KINDS, `${path}[${index}].kind`);
  const scope = enumValue(record.scope, ['PROJECT', 'OWNER'] as const, `${path}[${index}].scope`);
  const id = boundedIdentifier(record.id, `${path}[${index}].id`);
  const hasProjectId = Object.hasOwn(record, 'projectId');
  const hasProjectRevision = Object.hasOwn(record, 'projectRevision');

  if (PROJECT_TARGET_KINDS.has(kind) && scope !== 'PROJECT') fail('agent_intent_reference_scope_invalid', `${kind} references must be PROJECT scoped`);
  if (kind === 'GARMENT' && scope !== 'OWNER') fail('agent_intent_reference_scope_invalid', 'GARMENT references must be OWNER scoped in AgentIntentV1');

  if (scope === 'PROJECT') {
    if (!hasProjectId || !hasProjectRevision) fail('agent_intent_project_reference_incomplete', `${path}[${index}] PROJECT reference requires projectId and projectRevision`);
    return Object.freeze({
      kind,
      id,
      scope,
      projectId: boundedIdentifier(record.projectId, `${path}[${index}].projectId`),
      projectRevision: boundedInteger(record.projectRevision, `${path}[${index}].projectRevision`, 0, Number.MAX_SAFE_INTEGER),
    });
  }
  if (hasProjectId || hasProjectRevision) fail('agent_intent_owner_reference_widened', `${path}[${index}] OWNER reference cannot carry Project authority`);
  return Object.freeze({ kind, id, scope });
}

function normalizeRegionReference(raw: unknown, index: number, path: string): AgentIntentRegionReferenceV1 {
  const record = exactRecord(raw, REGION_KEYS, REGION_KEYS, `${path}[${index}]`);
  return Object.freeze({
    kind: enumValue(record.kind, REGION_KINDS, `${path}[${index}].kind`),
    id: boundedIdentifier(record.id, `${path}[${index}].id`),
    projectId: boundedIdentifier(record.projectId, `${path}[${index}].projectId`),
    projectRevision: boundedInteger(record.projectRevision, `${path}[${index}].projectRevision`, 0, Number.MAX_SAFE_INTEGER),
  });
}

function normalizeAmbiguity(raw: unknown, index: number, path: string): AgentIntentAmbiguityV1 {
  const record = exactRecord(raw, AMBIGUITY_KEYS, AMBIGUITY_KEYS, `${path}[${index}]`);
  const candidates = normalizeStringSet(record.candidateIds, `${path}[${index}].candidateIds`, 32, 128);
  if (candidates.length === 0) fail('agent_intent_ambiguity_candidates_empty', `${path}[${index}] must contain at least one candidate`);
  return Object.freeze({
    code: boundedToken(record.code, `${path}[${index}].code`, 80),
    fieldPath: boundedText(record.fieldPath, `${path}[${index}].fieldPath`, 1, 240, false),
    candidateIds: candidates,
    confidence: confidenceValue(record.confidence, `${path}[${index}].confidence`),
  });
}

function normalizeEvidence(raw: unknown, index: number, path: string): AgentIntentEvidenceV1 {
  const record = exactRecord(raw, EVIDENCE_KEYS, ['kind', 'ref'], `${path}[${index}]`);
  const sha256 = Object.hasOwn(record, 'sha256') ? sha256Value(record.sha256, `${path}[${index}].sha256`) : undefined;
  return Object.freeze({
    kind: enumValue(record.kind, EVIDENCE_KINDS, `${path}[${index}].kind`),
    ref: boundedIdentifier(record.ref, `${path}[${index}].ref`),
    ...(sha256 ? { sha256 } : {}),
  });
}

function exactRecord(raw: unknown, allowed: readonly string[], required: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('agent_intent_object_required', `${path} must be a plain object`);
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) fail('agent_intent_non_plain_object', `${path} must be a plain data object`);
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(record, key))) {
    fail('agent_intent_exact_schema_violation', `${path} accepts exactly the documented keys`);
  }
  return record;
}

function normalizeArray<T>(raw: unknown, path: string, max: number, item: (value: unknown, index: number, path: string) => T): readonly T[] {
  if (!Array.isArray(raw) || raw.length > max) fail('agent_intent_array_invalid', `${path} must be an array with at most ${max} items`);
  return Object.freeze(raw.map((value, index) => item(value, index, path)));
}

function normalizeStringSet(raw: unknown, path: string, maxItems: number, maxLength: number): readonly string[] {
  if (!Array.isArray(raw) || raw.length > maxItems) fail('agent_intent_string_set_invalid', `${path} must contain at most ${maxItems} strings`);
  const values = raw.map((value, index) => boundedText(value, `${path}[${index}]`, 1, maxLength, true));
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function normalizeEnumSet<T extends readonly string[]>(raw: unknown, allowed: T, path: string, maxItems: number): readonly T[number][] {
  if (!Array.isArray(raw) || raw.length > maxItems) fail('agent_intent_enum_set_invalid', `${path} must contain at most ${maxItems} values`);
  const values = raw.map((value, index) => enumValue(value, allowed, `${path}[${index}]`));
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)) as T[number][]);
}

function capabilityId(value: unknown): string {
  const capability = boundedText(value, 'goal.capability', 2, 64, false);
  if (!/^[A-Z][A-Z0-9_]*$/.test(capability)) fail('agent_intent_capability_invalid', 'goal.capability must be an uppercase capability identifier');
  return capability;
}

function boundedIdentifier(value: unknown, path: string): string {
  const text = boundedText(value, path, 1, 160, false);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(text)) fail('agent_intent_identifier_invalid', `${path} contains unsupported identifier characters`);
  return text;
}

function boundedToken(value: unknown, path: string, maxLength: number): string {
  const text = boundedText(value, path, 1, maxLength, false);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(text)) fail('agent_intent_token_invalid', `${path} contains unsupported token characters`);
  return text;
}

function boundedText(value: unknown, path: string, minLength: number, maxLength: number, preserveInnerWhitespace: boolean): string {
  if (typeof value !== 'string') fail('agent_intent_string_required', `${path} must be a string`);
  const trimmed = value.trim();
  const normalized = preserveInnerWhitespace ? trimmed : trimmed.replace(/\s+/g, ' ');
  if (normalized.length < minLength || normalized.length > maxLength) fail('agent_intent_string_bounds', `${path} must contain ${minLength}-${maxLength} characters`);
  if (/\u0000/.test(normalized)) fail('agent_intent_string_invalid', `${path} contains a forbidden NUL character`);
  return normalized;
}

function boundedInteger(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) fail('agent_intent_integer_invalid', `${path} must be a safe integer in [${min}, ${max}]`);
  return value;
}

function confidenceValue(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) fail('agent_intent_confidence_invalid', `${path} must be finite and within [0, 1]`);
  return value;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail('agent_intent_boolean_required', `${path} must be boolean`);
  return value;
}

function sha256Value(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail('agent_intent_sha256_invalid', `${path} must be lowercase SHA-256 hex`);
  return value;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value as T[number])) fail('agent_intent_enum_invalid', `${path} is unsupported`);
  return value as T[number];
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonicalValue(child)]),
  );
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}

function fail(code: string, message: string): never {
  throw new AgentIntentV1Error(code, message);
}
