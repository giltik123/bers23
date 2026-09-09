import { createHash } from 'node:crypto';

export const PLAN_PROPOSAL_V1_SCHEMA = 'BERS_AEE_PLAN_PROPOSAL_V1' as const;
export const PLAN_PROPOSAL_V1_DIGEST_VERSION = '1' as const;
const DIGEST_DOMAIN = `bers:aee:plan-proposal:v${PLAN_PROPOSAL_V1_DIGEST_VERSION}\0`;

export type PlanProposalParameterValueV1 = string | number | boolean;
export type PlanProposalParametersV1 = Readonly<Record<string, PlanProposalParameterValueV1>>;

export type PlanProposalInputSourceV1 =
  | Readonly<{ kind: 'INTENT_SOURCE' }>
  | Readonly<{ kind: 'NODE_OUTPUT'; nodeId: string }>;

export type PlanProposalInputV1 = Readonly<{
  name: string;
  source: PlanProposalInputSourceV1;
}>;

export type PlanProposalNodeV1 = Readonly<{
  nodeId: string;
  capabilityId: string;
  capabilityVersion: number;
  dependsOn: readonly string[];
  inputs: readonly PlanProposalInputV1[];
  parameters: PlanProposalParametersV1;
}>;

export type PlanProposalV1 = Readonly<{
  schemaVersion: typeof PLAN_PROPOSAL_V1_SCHEMA;
  plannerVersion: string;
  intentDigest: string;
  nodes: readonly PlanProposalNodeV1[];
}>;

export class PlanProposalV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PlanProposalV1Error';
    this.code = code;
  }
}

const ROOT_KEYS = ['schemaVersion', 'plannerVersion', 'intentDigest', 'nodes'] as const;
const NODE_KEYS = ['nodeId', 'capabilityId', 'capabilityVersion', 'dependsOn', 'inputs', 'parameters'] as const;
const INPUT_KEYS = ['name', 'source'] as const;
const INTENT_SOURCE_KEYS = ['kind'] as const;
const NODE_SOURCE_KEYS = ['kind', 'nodeId'] as const;

/**
 * Exact advisory AE-3 proposal boundary. Node ordering is intentionally not
 * semantic: normalized proposals are sorted by nodeId and dependencies/input
 * names are canonicalized before hashing or Core compilation.
 */
export function normalizePlanProposalV1(raw: unknown): PlanProposalV1 {
  const root = exactRecord(raw, ROOT_KEYS, ROOT_KEYS, 'root');
  if (root.schemaVersion !== PLAN_PROPOSAL_V1_SCHEMA) {
    fail('plan_proposal_schema_unsupported', `schemaVersion must be ${PLAN_PROPOSAL_V1_SCHEMA}`);
  }

  const rawNodes = denseArray(root.nodes, 'nodes', 1, 32);
  const nodes = rawNodes.map((node, index) => normalizeNode(node, index)).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.nodeId)) fail('plan_proposal_duplicate_node_id', `Duplicate nodeId: ${node.nodeId}`);
    ids.add(node.nodeId);
  }

  return deepFreeze({
    schemaVersion: PLAN_PROPOSAL_V1_SCHEMA,
    plannerVersion: text(root.plannerVersion, 'plannerVersion', 1, 120),
    intentDigest: sha256(root.intentDigest, 'intentDigest'),
    nodes: Object.freeze(nodes),
  });
}

export function serializePlanProposalV1(proposal: PlanProposalV1): string {
  return JSON.stringify(canonicalValue(normalizePlanProposalV1(proposal)));
}

export function planProposalV1Digest(proposal: PlanProposalV1): string {
  return createHash('sha256').update(DIGEST_DOMAIN).update(serializePlanProposalV1(proposal)).digest('hex');
}

function normalizeNode(raw: unknown, index: number): PlanProposalNodeV1 {
  const path = `nodes[${index}]`;
  const record = exactRecord(raw, NODE_KEYS, NODE_KEYS, path);
  const nodeId = nodeIdentifier(record.nodeId, `${path}.nodeId`);
  const dependsOn = stringSet(record.dependsOn, `${path}.dependsOn`, 31, nodeIdentifier);
  if (dependsOn.includes(nodeId)) fail('plan_proposal_self_dependency', `${path} cannot depend on itself`);

  const inputs = denseArray(record.inputs, `${path}.inputs`, 1, 8)
    .map((value, inputIndex) => normalizeInput(value, inputIndex, `${path}.inputs`))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (new Set(inputs.map(input => input.name)).size !== inputs.length) {
    fail('plan_proposal_duplicate_input', `${path} contains duplicate input names`);
  }

  return deepFreeze({
    nodeId,
    capabilityId: capabilityId(record.capabilityId, `${path}.capabilityId`),
    capabilityVersion: integer(record.capabilityVersion, `${path}.capabilityVersion`, 1, 1_000_000),
    dependsOn,
    inputs: Object.freeze(inputs),
    parameters: normalizeParameters(record.parameters, `${path}.parameters`),
  });
}

function normalizeInput(raw: unknown, index: number, parentPath: string): PlanProposalInputV1 {
  const path = `${parentPath}[${index}]`;
  const record = exactRecord(raw, INPUT_KEYS, INPUT_KEYS, path);
  const sourceBase = plainRecord(record.source, `${path}.source`);
  if (sourceBase.kind === 'INTENT_SOURCE') {
    exactKeys(sourceBase, INTENT_SOURCE_KEYS, INTENT_SOURCE_KEYS, `${path}.source`);
    return deepFreeze({ name: inputName(record.name, `${path}.name`), source: Object.freeze({ kind: 'INTENT_SOURCE' as const }) });
  }
  if (sourceBase.kind === 'NODE_OUTPUT') {
    exactKeys(sourceBase, NODE_SOURCE_KEYS, NODE_SOURCE_KEYS, `${path}.source`);
    return deepFreeze({
      name: inputName(record.name, `${path}.name`),
      source: Object.freeze({ kind: 'NODE_OUTPUT' as const, nodeId: nodeIdentifier(sourceBase.nodeId, `${path}.source.nodeId`) }),
    });
  }
  fail('plan_proposal_input_source_invalid', `${path}.source.kind is unsupported`);
}

function normalizeParameters(raw: unknown, path: string): PlanProposalParametersV1 {
  const record = plainRecord(raw, path);
  const entries = Object.entries(record);
  if (entries.length > 16) fail('plan_proposal_parameters_too_large', `${path} exceeds 16 parameters`);
  const normalized: Record<string, PlanProposalParameterValueV1> = {};
  for (const [rawKey, rawValue] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    const key = parameterName(rawKey, `${path}.${rawKey}`);
    if (typeof rawValue === 'string') normalized[key] = text(rawValue, `${path}.${key}`, 1, 256);
    else if (typeof rawValue === 'number') normalized[key] = integer(rawValue, `${path}.${key}`, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    else if (typeof rawValue === 'boolean') normalized[key] = rawValue;
    else fail('plan_proposal_parameter_value_invalid', `${path}.${key} must be string, safe integer or boolean`);
  }
  return deepFreeze(normalized);
}

function capabilityId(raw: unknown, path: string): string {
  const value = text(raw, path, 1, 160);
  if (!/^bers:capability:[a-z0-9]+(?:-[a-z0-9]+)*:v[1-9][0-9]*$/u.test(value)) {
    fail('plan_proposal_capability_id_invalid', `${path} must be a versioned BERS semantic capability ID`);
  }
  if (/(?:^|:|-)(?:local|cloud|provider|model|runtime|executor)(?:$|:|-)/u.test(value)) {
    fail('plan_proposal_realization_forbidden', `${path} may not encode realization authority`);
  }
  return value;
}

function nodeIdentifier(raw: unknown, path: string): string {
  const value = text(raw, path, 1, 64);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) fail('plan_proposal_node_id_invalid', `${path} is invalid`);
  return value;
}

function inputName(raw: unknown, path: string): string {
  const value = text(raw, path, 1, 80);
  if (!/^[a-z][A-Za-z0-9_]*$/u.test(value)) fail('plan_proposal_input_name_invalid', `${path} is invalid`);
  return value;
}

function parameterName(raw: unknown, path: string): string {
  if (typeof raw !== 'string' || !/^[a-z][A-Za-z0-9_]{0,63}$/u.test(raw)) fail('plan_proposal_parameter_name_invalid', `${path} is invalid`);
  return raw;
}

function stringSet(
  raw: unknown,
  path: string,
  max: number,
  normalize: (value: unknown, childPath: string) => string,
): readonly string[] {
  const values = denseArray(raw, path, 0, max).map((value, index) => normalize(value, `${path}[${index}]`));
  const unique = [...new Set(values)].sort((a, b) => a.localeCompare(b));
  if (unique.length !== values.length) fail('plan_proposal_set_duplicate', `${path} contains duplicates`);
  return Object.freeze(unique);
}

function denseArray(raw: unknown, path: string, min: number, max: number): readonly unknown[] {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max) fail('plan_proposal_array_invalid', `${path} must contain ${min}..${max} items`);
  for (let index = 0; index < raw.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(raw, index)) fail('plan_proposal_array_invalid', `${path} must be dense`);
  }
  return raw;
}

function exactRecord(raw: unknown, allowed: readonly string[], required: readonly string[], path: string): Record<string, unknown> {
  const record = plainRecord(raw, path);
  exactKeys(record, allowed, required, path);
  return record;
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[], required: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) if (!allowedSet.has(key)) fail('plan_proposal_exact_schema_violation', `${path} contains unsupported key ${key}`);
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(record, key)) fail('plan_proposal_exact_schema_violation', `${path} is missing required key ${key}`);
}

function plainRecord(raw: unknown, path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('plan_proposal_exact_schema_violation', `${path} must be a plain object`);
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) fail('plan_proposal_exact_schema_violation', `${path} must be a plain object`);
  return raw as Record<string, unknown>;
}

function integer(raw: unknown, path: string, min: number, max: number): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < min || raw > max) fail('plan_proposal_integer_invalid', `${path} must be a safe integer in range`);
  return raw;
}

function text(raw: unknown, path: string, min: number, max: number): string {
  if (typeof raw !== 'string') fail('plan_proposal_text_invalid', `${path} must be a string`);
  const value = raw.trim();
  if (value.length < min || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail('plan_proposal_text_invalid', `${path} is invalid`);
  return value;
}

function sha256(raw: unknown, path: string): string {
  const value = text(raw, path, 64, 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(value)) fail('plan_proposal_sha256_invalid', `${path} must be SHA-256 hex`);
  return value;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonicalValue(child)]));
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never { throw new PlanProposalV1Error(code, message); }
