import { createHash } from 'node:crypto';

export const AGENT_INTENT_V1_SCHEMA = 'BERS_AGENT_INTENT_V1' as const;
export const AGENT_INTENT_V1_DIGEST_VERSION = '1' as const;
const DIGEST_DOMAIN = `bers:aee:agent-intent:v${AGENT_INTENT_V1_DIGEST_VERSION}\0`;

const MODALITIES = ['TEXT', 'VOICE', 'TOUCH', 'IMAGE'] as const;
const TARGET_KINDS = ['GARMENT', 'PERSON', 'SELECTED_REGION', 'SELECTED_OBJECT', 'PRIOR_CANDIDATE'] as const;
const PROJECT_TARGET_KINDS = new Set<string>(['PERSON', 'SELECTED_REGION', 'SELECTED_OBJECT', 'PRIOR_CANDIDATE']);
const REGION_KINDS = ['FACE', 'HAIR', 'HANDS', 'BACKGROUND', 'LOGO', 'REGION', 'OBJECT', 'TARGET'] as const;
const QUALITY_LEVELS = ['FAST', 'BALANCED', 'QUALITY', 'ULTRA'] as const;
const EXECUTION_POLICIES = ['LOCAL_ONLY', 'LOCAL_FIRST', 'AUTO'] as const;
const EVIDENCE_KINDS = ['UI_SELECTION', 'PROJECT_STATE', 'USER_EXPLICIT', 'MODEL_ADVISORY', 'PRIOR_CANDIDATE'] as const;

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
  goal: Readonly<{ capability: string; instruction: string }>;
  source: Readonly<{ projectId: string; projectRevision: number; sourceRef: string }>;
  targets: readonly AgentIntentTargetReferenceV1[];
  mutable: readonly AgentIntentRegionReferenceV1[];
  preserve: readonly AgentIntentRegionReferenceV1[];
  constraints: Readonly<{ quality: AgentIntentQualityV1; styleTags: readonly string[] }>;
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
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AgentIntentV1Error';
    this.code = code;
  }
}

const ROOT_KEYS = [
  'schemaVersion', 'parserVersion', 'goal', 'source', 'targets', 'mutable', 'preserve',
  'constraints', 'execution', 'context', 'ambiguities', 'evidence', 'confidence',
] as const;
const GOAL_KEYS = ['capability', 'instruction'] as const;
const SOURCE_KEYS = ['projectId', 'projectRevision', 'sourceRef'] as const;
const TARGET_KEYS = ['kind', 'id', 'scope', 'projectId', 'projectRevision'] as const;
const REGION_KEYS = ['kind', 'id', 'projectId', 'projectRevision'] as const;
const CONSTRAINT_KEYS = ['quality', 'styleTags'] as const;
const EXECUTION_KEYS = [
  'policy', 'cloudAllowed', 'maxNodes', 'maxRetries', 'maxReplans', 'maxCandidates',
  'maxPaidCredits', 'maxWallClockMs', 'maxMemoryBytes',
] as const;
const CONTEXT_KEYS = ['modalities', 'uiReferences'] as const;
const AMBIGUITY_KEYS = ['code', 'fieldPath', 'candidateIds', 'confidence'] as const;
const EVIDENCE_KEYS = ['kind', 'ref', 'sha256'] as const;

/**
 * Canonical AE-1 boundary. The result is immutable advisory intent only; it grants
 * no capability, provider/model, Artifact, Billing, execution or Project authority.
 */
export function normalizeAgentIntentV1(raw: unknown): AgentIntentV1 {
  const root = exactRecord(raw, ROOT_KEYS, ROOT_KEYS, 'root');
  if (root.schemaVersion !== AGENT_INTENT_V1_SCHEMA) {
    fail('agent_intent_schema_unsupported', `schemaVersion must be ${AGENT_INTENT_V1_SCHEMA}`);
  }

  const goal = exactRecord(root.goal, GOAL_KEYS, GOAL_KEYS, 'goal');
  const sourceRaw = exactRecord(root.source, SOURCE_KEYS, SOURCE_KEYS, 'source');
  const constraints = exactRecord(root.constraints, CONSTRAINT_KEYS, CONSTRAINT_KEYS, 'constraints');
  const execution = exactRecord(root.execution, EXECUTION_KEYS, EXECUTION_KEYS, 'execution');
  const context = exactRecord(root.context, CONTEXT_KEYS, CONTEXT_KEYS, 'context');

  const source = Object.freeze({
    projectId: identifier(sourceRaw.projectId, 'source.projectId'),
    projectRevision: integer(sourceRaw.projectRevision, 'source.projectRevision', 0, Number.MAX_SAFE_INTEGER),
    sourceRef: identifier(sourceRaw.sourceRef, 'source.sourceRef'),
  });

  const policy = enumValue(execution.policy, EXECUTION_POLICIES, 'execution.policy');
  const cloudAllowed = bool(execution.cloudAllowed, 'execution.cloudAllowed');
  const maxPaidCredits = integer(execution.maxPaidCredits, 'execution.maxPaidCredits', 0, 1_000_000);
  if (policy === 'LOCAL_ONLY' && (cloudAllowed || maxPaidCredits !== 0)) {
    fail('agent_intent_local_only_violation', 'LOCAL_ONLY requires cloudAllowed=false and maxPaidCredits=0');
  }

  return deepFreeze({
    schemaVersion: AGENT_INTENT_V1_SCHEMA,
    parserVersion: text(root.parserVersion, 'parserVersion', 1, 120, false),
    goal: Object.freeze({
      capability: capability(goal.capability),
      instruction: text(goal.instruction, 'goal.instruction', 1, 4_000, true),
    }),
    source,
    targets: array(root.targets, 'targets', 32, normalizeTarget),
    mutable: array(root.mutable, 'mutable', 32, normalizeRegion),
    preserve: array(root.preserve, 'preserve', 32, normalizeRegion),
    constraints: Object.freeze({
      quality: enumValue(constraints.quality, QUALITY_LEVELS, 'constraints.quality'),
      styleTags: stringSet(constraints.styleTags, 'constraints.styleTags', 32, 80),
    }),
    execution: Object.freeze({
      policy,
      cloudAllowed,
      maxNodes: integer(execution.maxNodes, 'execution.maxNodes', 1, 32),
      maxRetries: integer(execution.maxRetries, 'execution.maxRetries', 0, 8),
      maxReplans: integer(execution.maxReplans, 'execution.maxReplans', 0, 8),
      maxCandidates: integer(execution.maxCandidates, 'execution.maxCandidates', 1, 16),
      maxPaidCredits,
      maxWallClockMs: integer(execution.maxWallClockMs, 'execution.maxWallClockMs', 1_000, 86_400_000),
      maxMemoryBytes: integer(execution.maxMemoryBytes, 'execution.maxMemoryBytes', 1_048_576, 137_438_953_472),
    }),
    context: Object.freeze({
      modalities: enumSet(context.modalities, MODALITIES, 'context.modalities', 4),
      uiReferences: array(context.uiReferences, 'context.uiReferences', 64, normalizeTarget),
    }),
    ambiguities: array(root.ambiguities, 'ambiguities', 32, normalizeAmbiguity),
    evidence: array(root.evidence, 'evidence', 64, normalizeEvidence),
    confidence: confidence(root.confidence, 'confidence'),
  });
}

export function serializeAgentIntentV1(intent: AgentIntentV1): string {
  return JSON.stringify(canonicalValue(normalizeAgentIntentV1(intent)));
}

export function agentIntentV1Digest(intent: AgentIntentV1): string {
  return createHash('sha256').update(DIGEST_DOMAIN).update(serializeAgentIntentV1(intent)).digest('hex');
}

/** Caller must supply this context from canonical Project authority immediately before compilation. */
export function assertAgentIntentV1CanonicalContext(
  intent: AgentIntentV1,
  context: AgentIntentCanonicalContextV1,
): AgentIntentV1 {
  const normalized = normalizeAgentIntentV1(intent);
  const projectId = identifier(context?.projectId, 'canonicalContext.projectId');
  const projectRevision = integer(context?.projectRevision, 'canonicalContext.projectRevision', 0, Number.MAX_SAFE_INTEGER);
  const sourceRef = identifier(context?.sourceRef, 'canonicalContext.sourceRef');

  if (normalized.source.projectId !== projectId) fail('agent_intent_cross_project', 'Intent source project differs from canonical Project');
  if (normalized.source.projectRevision !== projectRevision) fail('agent_intent_stale_project', 'Intent Project revision is stale');
  if (normalized.source.sourceRef !== sourceRef) fail('agent_intent_stale_source', 'Intent source reference is stale');

  for (const reference of [
    ...normalized.targets,
    ...normalized.mutable,
    ...normalized.preserve,
    ...normalized.context.uiReferences,
  ]) {
    if ('scope' in reference && reference.scope === 'OWNER') continue;
    if (reference.projectId !== projectId) fail('agent_intent_cross_project_reference', 'Intent contains a cross-project reference');
    if (reference.projectRevision !== projectRevision) fail('agent_intent_stale_reference', 'Intent contains a stale Project reference');
  }
  return normalized;
}

export function agentIntentV1RequiresClarification(intent: AgentIntentV1): boolean {
  return normalizeAgentIntentV1(intent).ambiguities.length > 0;
}

function normalizeTarget(raw: unknown, index: number, path: string): AgentIntentTargetReferenceV1 {
  const record = exactRecord(raw, TARGET_KEYS, ['kind', 'id', 'scope'], `${path}[${index}]`);
  const kind = enumValue(record.kind, TARGET_KINDS, `${path}[${index}].kind`);
  const scope = enumValue(record.scope, ['PROJECT', 'OWNER'] as const, `${path}[${index}].scope`);
  const id = identifier(record.id, `${path}[${index}].id`);
  const hasProjectId = Object.hasOwn(record, 'projectId');
  const hasProjectRevision = Object.hasOwn(record, 'projectRevision');

  if (PROJECT_TARGET_KINDS.has(kind) && scope !== 'PROJECT') {
    fail('agent_intent_reference_scope_invalid', `${kind} must be PROJECT scoped`);
  }
  if (kind === 'GARMENT' && scope !== 'OWNER') {
    fail('agent_intent_reference_scope_invalid', 'GARMENT must be OWNER scoped in AgentIntentV1');
  }

  if (scope === 'PROJECT') {
    if (!hasProjectId || !hasProjectRevision) {
      fail('agent_intent_project_reference_incomplete', `${path}[${index}] requires projectId and projectRevision`);
    }
    return Object.freeze({
      kind,
      id,
      scope,
      projectId: identifier(record.projectId, `${path}[${index}].projectId`),
      projectRevision: integer(record.projectRevision, `${path}[${index}].projectRevision`, 0, Number.MAX_SAFE_INTEGER),
    });
  }

  if (hasProjectId || hasProjectRevision) {
    fail('agent_intent_owner_reference_widened', `${path}[${index}] OWNER reference cannot carry Project authority`);
  }
  return Object.freeze({ kind, id, scope });
}

function normalizeRegion(raw: unknown, index: number, path: string): AgentIntentRegionReferenceV1 {
  const record = exactRecord(raw, REGION_KEYS, REGION_KEYS, `${path}[${index}]`);
  return Object.freeze({
    kind: enumValue(record.kind, REGION_KINDS, `${path}[${index}].kind`),
    id: identifier(record.id, `${path}[${index}].id`),
    projectId: identifier(record.projectId, `${path}[${index}].projectId`),
    projectRevision: integer(record.projectRevision, `${path}[${index}].projectRevision`, 0, Number.MAX_SAFE_INTEGER),
  });
}

function normalizeAmbiguity(raw: unknown, index: number, path: string): AgentIntentAmbiguityV1 {
  const record = exactRecord(raw, AMBIGUITY_KEYS, AMBIGUITY_KEYS, `${path}[${index}]`);
  const candidateIds = stringSet(record.candidateIds, `${path}[${index}].candidateIds`, 32, 128);
  if (candidateIds.length === 0) {
    fail('agent_intent_ambiguity_candidates_empty', `${path}[${index}] requires at least one candidate`);
  }
  return Object.freeze({
    code: token(record.code, `${path}[${index}].code`, 80),
    fieldPath: text(record.fieldPath, `${path}[${index}].fieldPath`, 1, 240, false),
    candidateIds,
    confidence: confidence(record.confidence, `${path}[${index}].confidence`),
  });
}

function normalizeEvidence(raw: unknown, index: number, path: string): AgentIntentEvidenceV1 {
  const record = exactRecord(raw, EVIDENCE_KEYS, ['kind', 'ref'], `${path}[${index}]`);
  const digest = Object.hasOwn(record, 'sha256') ? sha256(record.sha256, `${path}[${index}].sha256`) : undefined;
  return Object.freeze({
    kind: enumValue(record.kind, EVIDENCE_KINDS, `${path}[${index}].kind`),
    ref: identifier(record.ref, `${path}[${index}].ref`),
    ...(digest ? { sha256: digest } : {}),
  });
}

function exactRecord(
  raw: unknown,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('agent_intent_object_required', `${path} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('agent_intent_non_plain_object', `${path} must be plain data`);
  }
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(record, key))) {
    fail('agent_intent_exact_schema_violation', `${path} accepts exactly the documented keys`);
  }
  return record;
}

function array<T>(
  raw: unknown,
  path: string,
  max: number,
  normalize: (value: unknown, index: number, path: string) => T,
): readonly T[] {
  if (!Array.isArray(raw) || raw.length > max) {
    fail('agent_intent_array_invalid', `${path} must contain at most ${max} items`);
  }
  return Object.freeze(raw.map((value, index) => normalize(value, index, path)));
}

function stringSet(raw: unknown, path: string, maxItems: number, maxLength: number): readonly string[] {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    fail('agent_intent_string_set_invalid', `${path} must contain at most ${maxItems} strings`);
  }
  const values = raw.map((value, index) => text(value, `${path}[${index}]`, 1, maxLength, true));
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function enumSet<T extends readonly string[]>(raw: unknown, allowed: T, path: string, maxItems: number): readonly T[number][] {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    fail('agent_intent_enum_set_invalid', `${path} must contain at most ${maxItems} values`);
  }
  const values = raw.map((value, index) => enumValue(value, allowed, `${path}[${index}]`));
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)) as T[number][]);
}

function capability(value: unknown): string {
  const normalized = text(value, 'goal.capability', 2, 64, false);
  if (!/^[A-Z][A-Z0-9_]*$/.test(normalized)) {
    fail('agent_intent_capability_invalid', 'goal.capability must be an uppercase capability identifier');
  }
  return normalized;
}

function identifier(value: unknown, path: string): string {
  const normalized = text(value, path, 1, 160, false);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(normalized)) {
    fail('agent_intent_identifier_invalid', `${path} contains unsupported identifier characters`);
  }
  return normalized;
}

function token(value: unknown, path: string, maxLength: number): string {
  const normalized = text(value, path, 1, maxLength, false);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(normalized)) {
    fail('agent_intent_token_invalid', `${path} contains unsupported token characters`);
  }
  return normalized;
}

function text(value: unknown, path: string, min: number, max: number, preserveInnerWhitespace: boolean): string {
  if (typeof value !== 'string') fail('agent_intent_string_required', `${path} must be a string`);
  const trimmed = value.trim();
  const normalized = preserveInnerWhitespace ? trimmed : trimmed.replace(/\s+/g, ' ');
  if (normalized.length < min || normalized.length > max) {
    fail('agent_intent_string_bounds', `${path} must contain ${min}-${max} characters`);
  }
  if (normalized.includes('\u0000')) fail('agent_intent_string_invalid', `${path} contains NUL`);
  return normalized;
}

function integer(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    fail('agent_intent_integer_invalid', `${path} must be a safe integer in [${min}, ${max}]`);
  }
  return value;
}

function confidence(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    fail('agent_intent_confidence_invalid', `${path} must be finite and within [0, 1]`);
  }
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail('agent_intent_boolean_required', `${path} must be boolean`);
  return value;
}

function sha256(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    fail('agent_intent_sha256_invalid', `${path} must be lowercase SHA-256 hex`);
  }
  return value;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value as T[number])) {
    fail('agent_intent_enum_invalid', `${path} is unsupported`);
  }
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
