import { createHash } from 'node:crypto';

export const CONTEXT_GRAPH_V1_SCHEMA = 'BERS_CONTEXT_GRAPH_V1' as const;
export const CONTEXT_GRAPH_V1_DIGEST_VERSION = '1' as const;
const DIGEST_DOMAIN = `bers:aee:context-graph:v${CONTEXT_GRAPH_V1_DIGEST_VERSION}\0`;

const SOURCE_ROLES = ['ORIGINAL', 'COMPOSITE'] as const;
const SOURCE_LIFECYCLES = ['IMMUTABLE', 'FINAL'] as const;
const HISTORY_KINDS = ['ORIGINAL', 'ACCEPTED_FINAL', 'RESTORE_VERSION'] as const;
const GARMENT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
const REPRESENTATION_TIERS = ['BASIC', 'PARAMETRIC', 'FULL_3D'] as const;
const OUTFIT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
const OUTFIT_GARMENT_REFERENCE_STATES = ['GROUNDED', 'UNAVAILABLE', 'OUTSIDE_BOUNDED_WINDOW'] as const;
const EPHEMERAL_KINDS = ['PERSON', 'SELECTED_REGION', 'SELECTED_OBJECT'] as const;

export type ContextGraphEphemeralKindV1 = typeof EPHEMERAL_KINDS[number];

export type ContextGraphEphemeralReferenceV1 = Readonly<{
  kind: ContextGraphEphemeralKindV1;
  id: string;
  projectId: string;
  sourceStorageId: string;
  uiRevision: string;
}>;

export type ContextGraphV1 = Readonly<{
  schemaVersion: typeof CONTEXT_GRAPH_V1_SCHEMA;
  project: Readonly<{
    projectId: string;
    historyCursorId: string;
    cursorOrdinal: number;
    originalSourceStorageId: string;
    currentSourceStorageId: string;
    width: number;
    height: number;
  }>;
  currentSource: Readonly<{
    storageId: string;
    role: typeof SOURCE_ROLES[number];
    lifecycle: typeof SOURCE_LIFECYCLES[number];
    width: number;
    height: number;
    executionId?: string;
    operationId?: string;
    sourceStorageId?: string;
    producerOperation?: string;
  }>;
  history: readonly Readonly<{
    historyId: string;
    ordinal: number;
    imageStorageId: string;
    sourceStorageId: string;
    kind: typeof HISTORY_KINDS[number];
  }>[];
  candidates: readonly Readonly<{
    storageId: string;
    width: number;
    height: number;
    isCurrent: boolean;
    executionId?: string;
    operationId?: string;
    sourceStorageId?: string;
    producerOperation?: string;
  }>[];
  garments: readonly Readonly<{
    garmentId: string;
    revision: number;
    status: typeof GARMENT_STATUSES[number];
    representationTier: typeof REPRESENTATION_TIERS[number];
    primaryViewId: string;
    primaryViewSha256: string;
  }>[];
  outfits: readonly Readonly<{
    outfitId: string;
    revision: number;
    status: typeof OUTFIT_STATUSES[number];
    entries: readonly Readonly<{
      entryId: string;
      garmentId: string;
      garmentReferenceState: typeof OUTFIT_GARMENT_REFERENCE_STATES[number];
      position: number;
      layerRole: string;
    }>[];
  }>[];
  ephemeral: readonly ContextGraphEphemeralReferenceV1[];
}>;

export type ContextGraphV1Envelope = Readonly<{
  graph: ContextGraphV1;
  digest: string;
}>;

export class ContextGraphV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ContextGraphV1Error';
    this.code = code;
  }
}

const ROOT_KEYS = ['schemaVersion', 'project', 'currentSource', 'history', 'candidates', 'garments', 'outfits', 'ephemeral'] as const;
const PROJECT_KEYS = ['projectId', 'historyCursorId', 'cursorOrdinal', 'originalSourceStorageId', 'currentSourceStorageId', 'width', 'height'] as const;
const SOURCE_KEYS = ['storageId', 'role', 'lifecycle', 'width', 'height', 'executionId', 'operationId', 'sourceStorageId', 'producerOperation'] as const;
const HISTORY_KEYS = ['historyId', 'ordinal', 'imageStorageId', 'sourceStorageId', 'kind'] as const;
const CANDIDATE_KEYS = ['storageId', 'width', 'height', 'isCurrent', 'executionId', 'operationId', 'sourceStorageId', 'producerOperation'] as const;
const GARMENT_KEYS = ['garmentId', 'revision', 'status', 'representationTier', 'primaryViewId', 'primaryViewSha256'] as const;
const OUTFIT_KEYS = ['outfitId', 'revision', 'status', 'entries'] as const;
const OUTFIT_ENTRY_KEYS = ['entryId', 'garmentId', 'garmentReferenceState', 'position', 'layerRole'] as const;
const EPHEMERAL_KEYS = ['kind', 'id', 'projectId', 'sourceStorageId', 'uiRevision'] as const;

export function normalizeContextGraphEphemeralV1(raw: unknown): readonly ContextGraphEphemeralReferenceV1[] {
  if (!Array.isArray(raw) || raw.length > 32) fail('context_graph_ephemeral_invalid', 'ephemeral must contain at most 32 references');
  const normalized = raw.map((item, index) => {
    const record = exactRecord(item, EPHEMERAL_KEYS, EPHEMERAL_KEYS, `ephemeral[${index}]`);
    return Object.freeze({
      kind: enumValue(record.kind, EPHEMERAL_KINDS, `ephemeral[${index}].kind`),
      id: identifier(record.id, `ephemeral[${index}].id`),
      projectId: identifier(record.projectId, `ephemeral[${index}].projectId`),
      sourceStorageId: identifier(record.sourceStorageId, `ephemeral[${index}].sourceStorageId`),
      uiRevision: token(record.uiRevision, `ephemeral[${index}].uiRevision`, 160),
    });
  });
  normalized.sort((left, right) => tuple(left.kind, left.id, left.uiRevision).localeCompare(tuple(right.kind, right.id, right.uiRevision)));
  assertUnique(normalized.map(item => `${item.kind}\0${item.id}\0${item.uiRevision}`), 'context_graph_ephemeral_duplicate');
  return Object.freeze(normalized);
}

export function normalizeContextGraphV1(raw: unknown): ContextGraphV1 {
  const root = exactRecord(raw, ROOT_KEYS, ROOT_KEYS, 'root');
  if (root.schemaVersion !== CONTEXT_GRAPH_V1_SCHEMA) fail('context_graph_schema_unsupported', `schemaVersion must be ${CONTEXT_GRAPH_V1_SCHEMA}`);

  const projectRaw = exactRecord(root.project, PROJECT_KEYS, PROJECT_KEYS, 'project');
  const sourceRaw = exactRecord(root.currentSource, SOURCE_KEYS, ['storageId', 'role', 'lifecycle', 'width', 'height'], 'currentSource');
  const project = Object.freeze({
    projectId: identifier(projectRaw.projectId, 'project.projectId'),
    historyCursorId: identifier(projectRaw.historyCursorId, 'project.historyCursorId'),
    cursorOrdinal: integer(projectRaw.cursorOrdinal, 'project.cursorOrdinal', 0, Number.MAX_SAFE_INTEGER),
    originalSourceStorageId: identifier(projectRaw.originalSourceStorageId, 'project.originalSourceStorageId'),
    currentSourceStorageId: identifier(projectRaw.currentSourceStorageId, 'project.currentSourceStorageId'),
    width: integer(projectRaw.width, 'project.width', 1, 1_000_000),
    height: integer(projectRaw.height, 'project.height', 1, 1_000_000),
  });
  const currentSource = normalizeSource(sourceRaw);
  if (currentSource.storageId !== project.currentSourceStorageId) fail('context_graph_current_source_mismatch', 'Project current source and currentSource node differ');
  if (currentSource.width !== project.width || currentSource.height !== project.height) fail('context_graph_current_geometry_mismatch', 'Project geometry and current source geometry differ');
  if (currentSource.role === 'ORIGINAL' && currentSource.lifecycle !== 'IMMUTABLE') fail('context_graph_source_role_invalid', 'ORIGINAL source must be IMMUTABLE');
  if (currentSource.role === 'COMPOSITE' && currentSource.lifecycle !== 'FINAL') fail('context_graph_source_role_invalid', 'COMPOSITE source must be FINAL');

  const history = normalizeArray(root.history, 'history', 64, normalizeHistory);
  history.sort((a, b) => a.ordinal - b.ordinal || a.historyId.localeCompare(b.historyId));
  assertUnique(history.map(item => item.historyId), 'context_graph_history_duplicate');
  const cursor = history.find(item => item.historyId === project.historyCursorId);
  if (!cursor || cursor.ordinal !== project.cursorOrdinal || cursor.imageStorageId !== project.currentSourceStorageId) {
    fail('context_graph_cursor_mismatch', 'Project cursor does not resolve to the exact current source');
  }

  const candidates = normalizeArray(root.candidates, 'candidates', 32, normalizeCandidate);
  candidates.sort((a, b) => a.storageId.localeCompare(b.storageId));
  assertUnique(candidates.map(item => item.storageId), 'context_graph_candidate_duplicate');

  const garments = normalizeArray(root.garments, 'garments', 64, normalizeGarment);
  garments.sort((a, b) => a.garmentId.localeCompare(b.garmentId));
  assertUnique(garments.map(item => item.garmentId), 'context_graph_garment_duplicate');

  const outfits = normalizeArray(root.outfits, 'outfits', 64, normalizeOutfit);
  outfits.sort((a, b) => a.outfitId.localeCompare(b.outfitId));
  assertUnique(outfits.map(item => item.outfitId), 'context_graph_outfit_duplicate');
  assertUnique(
    outfits.flatMap(outfit => outfit.entries.map(entry => entry.entryId)),
    'context_graph_outfit_entry_global_duplicate',
  );
  const garmentIds = new Set(garments.map(garment => garment.garmentId));
  for (const outfit of outfits) {
    for (const entry of outfit.entries) {
      const hasGarmentNode = garmentIds.has(entry.garmentId);
      if (entry.garmentReferenceState === 'GROUNDED' && !hasGarmentNode) {
        fail('context_graph_outfit_garment_unresolved', 'GROUNDED Outfit entry does not resolve to a Garment node in the same Context Graph');
      }
      if (entry.garmentReferenceState !== 'GROUNDED' && hasGarmentNode) {
        fail('context_graph_outfit_garment_state_conflict', 'Non-grounded Outfit entry cannot coexist with the same Garment node');
      }
    }
  }

  const ephemeral = [...normalizeContextGraphEphemeralV1(root.ephemeral)];
  for (const reference of ephemeral) {
    if (reference.projectId !== project.projectId) fail('context_graph_ephemeral_cross_project', 'Ephemeral reference is scoped to another Project');
    if (reference.sourceStorageId !== project.currentSourceStorageId) fail('context_graph_ephemeral_stale_source', 'Ephemeral reference is bound to a stale Project source');
  }

  return deepFreeze({
    schemaVersion: CONTEXT_GRAPH_V1_SCHEMA,
    project,
    currentSource,
    history,
    candidates,
    garments,
    outfits,
    ephemeral,
  });
}

export function serializeContextGraphV1(graph: ContextGraphV1): string {
  return JSON.stringify(canonicalValue(normalizeContextGraphV1(graph)));
}

export function contextGraphV1Digest(graph: ContextGraphV1): string {
  return createHash('sha256').update(DIGEST_DOMAIN).update(serializeContextGraphV1(graph)).digest('hex');
}

export function contextGraphV1Envelope(graph: ContextGraphV1): ContextGraphV1Envelope {
  const normalized = normalizeContextGraphV1(graph);
  return Object.freeze({ graph: normalized, digest: contextGraphV1Digest(normalized) });
}

function normalizeSource(record: Record<string, unknown>): ContextGraphV1['currentSource'] {
  return Object.freeze({
    storageId: identifier(record.storageId, 'currentSource.storageId'),
    role: enumValue(record.role, SOURCE_ROLES, 'currentSource.role'),
    lifecycle: enumValue(record.lifecycle, SOURCE_LIFECYCLES, 'currentSource.lifecycle'),
    width: integer(record.width, 'currentSource.width', 1, 1_000_000),
    height: integer(record.height, 'currentSource.height', 1, 1_000_000),
    ...optionalIdentifier(record, 'executionId', 'currentSource.executionId'),
    ...optionalIdentifier(record, 'operationId', 'currentSource.operationId'),
    ...optionalIdentifier(record, 'sourceStorageId', 'currentSource.sourceStorageId'),
    ...optionalToken(record, 'producerOperation', 'currentSource.producerOperation', 160),
  });
}

function normalizeHistory(raw: unknown, index: number): ContextGraphV1['history'][number] {
  const record = exactRecord(raw, HISTORY_KEYS, HISTORY_KEYS, `history[${index}]`);
  return Object.freeze({
    historyId: identifier(record.historyId, `history[${index}].historyId`),
    ordinal: integer(record.ordinal, `history[${index}].ordinal`, 0, Number.MAX_SAFE_INTEGER),
    imageStorageId: identifier(record.imageStorageId, `history[${index}].imageStorageId`),
    sourceStorageId: identifier(record.sourceStorageId, `history[${index}].sourceStorageId`),
    kind: enumValue(record.kind, HISTORY_KINDS, `history[${index}].kind`),
  });
}

function normalizeCandidate(raw: unknown, index: number): ContextGraphV1['candidates'][number] {
  const record = exactRecord(raw, CANDIDATE_KEYS, ['storageId', 'width', 'height', 'isCurrent'], `candidates[${index}]`);
  return Object.freeze({
    storageId: identifier(record.storageId, `candidates[${index}].storageId`),
    width: integer(record.width, `candidates[${index}].width`, 1, 1_000_000),
    height: integer(record.height, `candidates[${index}].height`, 1, 1_000_000),
    isCurrent: bool(record.isCurrent, `candidates[${index}].isCurrent`),
    ...optionalIdentifier(record, 'executionId', `candidates[${index}].executionId`),
    ...optionalIdentifier(record, 'operationId', `candidates[${index}].operationId`),
    ...optionalIdentifier(record, 'sourceStorageId', `candidates[${index}].sourceStorageId`),
    ...optionalToken(record, 'producerOperation', `candidates[${index}].producerOperation`, 160),
  });
}

function normalizeGarment(raw: unknown, index: number): ContextGraphV1['garments'][number] {
  const record = exactRecord(raw, GARMENT_KEYS, GARMENT_KEYS, `garments[${index}]`);
  return Object.freeze({
    garmentId: identifier(record.garmentId, `garments[${index}].garmentId`),
    revision: integer(record.revision, `garments[${index}].revision`, 1, Number.MAX_SAFE_INTEGER),
    status: enumValue(record.status, GARMENT_STATUSES, `garments[${index}].status`),
    representationTier: enumValue(record.representationTier, REPRESENTATION_TIERS, `garments[${index}].representationTier`),
    primaryViewId: identifier(record.primaryViewId, `garments[${index}].primaryViewId`),
    primaryViewSha256: sha256(record.primaryViewSha256, `garments[${index}].primaryViewSha256`),
  });
}

function normalizeOutfit(raw: unknown, index: number): ContextGraphV1['outfits'][number] {
  const record = exactRecord(raw, OUTFIT_KEYS, OUTFIT_KEYS, `outfits[${index}]`);
  const entries = normalizeArray(record.entries, `outfits[${index}].entries`, 32, (item, entryIndex) => {
    const entry = exactRecord(item, OUTFIT_ENTRY_KEYS, OUTFIT_ENTRY_KEYS, `outfits[${index}].entries[${entryIndex}]`);
    return Object.freeze({
      entryId: identifier(entry.entryId, `outfits[${index}].entries[${entryIndex}].entryId`),
      garmentId: identifier(entry.garmentId, `outfits[${index}].entries[${entryIndex}].garmentId`),
      garmentReferenceState: enumValue(entry.garmentReferenceState, OUTFIT_GARMENT_REFERENCE_STATES, `outfits[${index}].entries[${entryIndex}].garmentReferenceState`),
      position: integer(entry.position, `outfits[${index}].entries[${entryIndex}].position`, 0, 31),
      layerRole: token(entry.layerRole, `outfits[${index}].entries[${entryIndex}].layerRole`, 80),
    });
  });
  entries.sort((a, b) => a.position - b.position || a.entryId.localeCompare(b.entryId));
  assertUnique(entries.map(item => item.entryId), 'context_graph_outfit_entry_duplicate');
  assertUnique(entries.map(item => item.garmentId), 'context_graph_outfit_garment_duplicate');
  assertUnique(entries.map(item => String(item.position)), 'context_graph_outfit_position_duplicate');
  if (entries.some((item, position) => item.position !== position)) {
    fail('context_graph_outfit_positions_not_dense', 'Outfit entry positions must be dense from zero');
  }
  return Object.freeze({
    outfitId: identifier(record.outfitId, `outfits[${index}].outfitId`),
    revision: integer(record.revision, `outfits[${index}].revision`, 1, Number.MAX_SAFE_INTEGER),
    status: enumValue(record.status, OUTFIT_STATUSES, `outfits[${index}].status`),
    entries: Object.freeze(entries),
  });
}

function exactRecord(raw: unknown, allowed: readonly string[], required: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('context_graph_object_required', `${path} must be a plain object`);
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) fail('context_graph_non_plain_object', `${path} must be plain data`);
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(record, key))) {
    fail('context_graph_exact_schema_violation', `${path} accepts exactly the documented keys`);
  }
  return record;
}

function normalizeArray<T>(raw: unknown, path: string, max: number, normalize: (value: unknown, index: number) => T): T[] {
  if (!Array.isArray(raw) || raw.length > max) fail('context_graph_array_invalid', `${path} must contain at most ${max} items`);
  return raw.map((value, index) => normalize(value, index));
}

function optionalIdentifier(record: Record<string, unknown>, key: string, path: string): Record<string, string> {
  if (!Object.hasOwn(record, key) || record[key] === undefined || record[key] === null) return {};
  return { [key]: identifier(record[key], path) };
}

function optionalToken(record: Record<string, unknown>, key: string, path: string, max: number): Record<string, string> {
  if (!Object.hasOwn(record, key) || record[key] === undefined || record[key] === null) return {};
  return { [key]: token(record[key], path, max) };
}

function identifier(raw: unknown, path: string): string {
  if (typeof raw !== 'string') fail('context_graph_identifier_invalid', `${path} must be a string identifier`);
  const value = raw.trim();
  if (!value || value.length > 200 || /[\u0000-\u001f\u007f]/u.test(value)) fail('context_graph_identifier_invalid', `${path} is invalid`);
  return value;
}

function token(raw: unknown, path: string, max: number): string {
  if (typeof raw !== 'string') fail('context_graph_token_invalid', `${path} must be a string token`);
  const value = raw.trim();
  if (!value || value.length > max || !/^[A-Za-z0-9._:/-]+$/u.test(value)) fail('context_graph_token_invalid', `${path} is invalid`);
  return value;
}

function sha256(raw: unknown, path: string): string {
  if (typeof raw !== 'string' || !/^[0-9a-f]{64}$/u.test(raw)) fail('context_graph_sha256_invalid', `${path} must be lowercase SHA-256`);
  return raw;
}

function integer(raw: unknown, path: string, min: number, max: number): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < min || raw > max) fail('context_graph_integer_invalid', `${path} must be an integer in range`);
  return raw;
}

function bool(raw: unknown, path: string): boolean {
  if (typeof raw !== 'boolean') fail('context_graph_boolean_invalid', `${path} must be boolean`);
  return raw;
}

function enumValue<const T extends readonly string[]>(raw: unknown, values: T, path: string): T[number] {
  if (typeof raw !== 'string' || !values.includes(raw)) fail('context_graph_enum_invalid', `${path} is not an accepted value`);
  return raw as T[number];
}

function assertUnique(values: readonly string[], code: string): void {
  if (new Set(values).size !== values.length) fail(code, 'Context Graph contains duplicate identities');
}

function tuple(...values: string[]): string { return values.join('\0'); }

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonicalValue(child)]));
  }
  return value;
}

function deepFreeze<Value>(value: Value, seen = new WeakSet<object>()): Value {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  }
  return value;
}

function fail(code: string, message: string): never { throw new ContextGraphV1Error(code, message); }
