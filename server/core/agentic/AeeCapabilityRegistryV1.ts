import { createHash } from 'node:crypto';
import type { CreativeArtifactRole } from '../../../src/platform/creative/canonical/contracts.ts';
import {
  ORTHOGONAL_TRANSFORM_TOOL_DEFINITION,
  RESIZE_TOOL_DEFINITION,
  requireDeterministicToolByCapability,
  type DeterministicToolDefinition,
} from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';

export const AEE_CAPABILITY_REGISTRY_V1_SCHEMA = 'BERS_AEE_CAPABILITY_REGISTRY_V1' as const;
export const AEE_CAPABILITY_DESCRIPTOR_V1_SCHEMA = 'BERS_AEE_CAPABILITY_DESCRIPTOR_V1' as const;
export const AEE_CAPABILITY_REGISTRY_V1_VERSION = 1 as const;
export const AEE_CAPABILITY_REGISTRY_V1_DIGEST_VERSION = '1' as const;

export const AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1 = 'bers:capability:orthogonal-transform:v1' as const;
export const AEE_CAPABILITY_RESIZE_V1 = 'bers:capability:resize:v1' as const;

const DIGEST_DOMAIN = `bers:aee:capability-registry:v${AEE_CAPABILITY_REGISTRY_V1_DIGEST_VERSION}\0`;
const CREATIVE_ROLES: readonly CreativeArtifactRole[] = Object.freeze([
  'ORIGINAL', 'WORKING', 'MASK', 'ROI_INPUT', 'PATCH', 'VERIFIED_PATCH', 'COMPOSITE', 'PREVIEW',
]);
const PRECONDITION_CLASSES = [
  'CURRENT_PROJECT_SOURCE',
  'CANONICAL_IMAGE_ARTIFACT',
  'CORE_RESOURCE_LIMITS',
  'ORTHOGONAL_MODE_REQUIRED',
  'TARGET_DIMENSIONS_REQUIRED',
] as const;
const SIDE_EFFECT_CLASSES = ['CANDIDATE_ARTIFACT_ONLY'] as const;
const RESOURCE_CLASSES = ['BOUNDED_IMAGE_TRANSFORM'] as const;
const EVIDENCE_CLASSES = ['BYTE_EXACT_CORE_RECOMPUTE'] as const;
const READINESS_CLASSES = ['PRODUCTION_READY'] as const;
const EVALUATOR_HOOKS = ['ARTIFACT_LINEAGE', 'BYTE_EXACT_VERIFICATION'] as const;
const USER_CONFIRMATION_CLASSES = ['NO_PRE_EXECUTION_CONFIRMATION'] as const;

export type AeeCapabilityPreconditionV1 = typeof PRECONDITION_CLASSES[number];
export type AeeCapabilitySideEffectClassV1 = typeof SIDE_EFFECT_CLASSES[number];
export type AeeCapabilityResourceClassV1 = typeof RESOURCE_CLASSES[number];
export type AeeCapabilityEvidenceClassV1 = typeof EVIDENCE_CLASSES[number];
export type AeeCapabilityReadinessClassV1 = typeof READINESS_CLASSES[number];
export type AeeCapabilityEvaluatorHookV1 = typeof EVALUATOR_HOOKS[number];
export type AeeCapabilityUserConfirmationV1 = typeof USER_CONFIRMATION_CLASSES[number];

export type AeeCapabilityInputV1 = Readonly<{
  name: string;
  artifactRoles: readonly CreativeArtifactRole[];
}>;

export type AeeCapabilityDescriptorV1 = Readonly<{
  schemaVersion: typeof AEE_CAPABILITY_DESCRIPTOR_V1_SCHEMA;
  capabilityId: string;
  capabilityVersion: number;
  semanticOperation: string;
  inputs: readonly AeeCapabilityInputV1[];
  outputArtifactRole: CreativeArtifactRole;
  preconditions: readonly AeeCapabilityPreconditionV1[];
  executionEligibility: Readonly<{
    deterministic: boolean;
    local: boolean;
    cloud: boolean;
    hybrid: boolean;
  }>;
  sideEffectClass: AeeCapabilitySideEffectClassV1;
  resourceClass: AeeCapabilityResourceClassV1;
  requiredEvidence: AeeCapabilityEvidenceClassV1;
  readinessClass: AeeCapabilityReadinessClassV1;
  evaluatorHooks: readonly AeeCapabilityEvaluatorHookV1[];
  userConfirmation: AeeCapabilityUserConfirmationV1;
}>;

export type AeeCapabilityDeterministicBindingV1 = Readonly<{
  kind: 'DETERMINISTIC_TOOL';
  toolCapability: string;
}>;

export type AeeCapabilityRegistrationV1 = Readonly<{
  descriptor: AeeCapabilityDescriptorV1;
  binding: AeeCapabilityDeterministicBindingV1;
}>;

export type AeeCapabilityRegistryV1 = Readonly<{
  schemaVersion: typeof AEE_CAPABILITY_REGISTRY_V1_SCHEMA;
  registryVersion: typeof AEE_CAPABILITY_REGISTRY_V1_VERSION;
  descriptors: readonly AeeCapabilityDescriptorV1[];
  digest: string;
}>;

export class AeeCapabilityRegistryV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AeeCapabilityRegistryV1Error';
    this.code = code;
  }
}

const DESCRIPTOR_KEYS = [
  'schemaVersion', 'capabilityId', 'capabilityVersion', 'semanticOperation', 'inputs', 'outputArtifactRole',
  'preconditions', 'executionEligibility', 'sideEffectClass', 'resourceClass', 'requiredEvidence', 'readinessClass',
  'evaluatorHooks', 'userConfirmation',
] as const;
const INPUT_KEYS = ['name', 'artifactRoles'] as const;
const ELIGIBILITY_KEYS = ['deterministic', 'local', 'cloud', 'hybrid'] as const;
const BINDING_KEYS = ['kind', 'toolCapability'] as const;
const REGISTRATION_KEYS = ['descriptor', 'binding'] as const;

function deterministicRegistration(
  capabilityId: string,
  tool: DeterministicToolDefinition,
  preconditions: readonly AeeCapabilityPreconditionV1[],
): AeeCapabilityRegistrationV1 {
  return deepFreeze({
    descriptor: {
      schemaVersion: AEE_CAPABILITY_DESCRIPTOR_V1_SCHEMA,
      capabilityId,
      capabilityVersion: 1,
      semanticOperation: tool.operation.type,
      inputs: tool.inputs.map(input => Object.freeze({ name: input.name, artifactRoles: Object.freeze([...input.roles]) })),
      outputArtifactRole: tool.output.role,
      preconditions: Object.freeze([...preconditions]),
      executionEligibility: Object.freeze({ deterministic: true, local: true, cloud: false, hybrid: false }),
      sideEffectClass: 'CANDIDATE_ARTIFACT_ONLY',
      resourceClass: 'BOUNDED_IMAGE_TRANSFORM',
      requiredEvidence: 'BYTE_EXACT_CORE_RECOMPUTE',
      readinessClass: 'PRODUCTION_READY',
      evaluatorHooks: Object.freeze(['ARTIFACT_LINEAGE', 'BYTE_EXACT_VERIFICATION']),
      userConfirmation: 'NO_PRE_EXECUTION_CONFIRMATION',
    },
    binding: Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolCapability: tool.capability }),
  });
}

const DEFAULT_REGISTRATIONS: readonly AeeCapabilityRegistrationV1[] = Object.freeze([
  deterministicRegistration(
    AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1,
    ORTHOGONAL_TRANSFORM_TOOL_DEFINITION,
    ['CURRENT_PROJECT_SOURCE', 'CANONICAL_IMAGE_ARTIFACT', 'CORE_RESOURCE_LIMITS', 'ORTHOGONAL_MODE_REQUIRED'],
  ),
  deterministicRegistration(
    AEE_CAPABILITY_RESIZE_V1,
    RESIZE_TOOL_DEFINITION,
    ['CURRENT_PROJECT_SOURCE', 'CANONICAL_IMAGE_ARTIFACT', 'CORE_RESOURCE_LIMITS', 'TARGET_DIMENSIONS_REQUIRED'],
  ),
]);

const V1_EXPECTED_BINDING_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  [AEE_CAPABILITY_ORTHOGONAL_TRANSFORM_V1]: ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.capability,
  [AEE_CAPABILITY_RESIZE_V1]: RESIZE_TOOL_DEFINITION.capability,
});
const V1_EXPECTED_REGISTRATION_BY_ID = new Map<string, AeeCapabilityRegistrationV1>(
  DEFAULT_REGISTRATIONS.map((registration, index) => {
    const normalized = normalizeRegistration(registration, index);
    return [normalized.descriptor.capabilityId, normalized];
  }),
);
const V1_CAPABILITY_COUNT = V1_EXPECTED_REGISTRATION_BY_ID.size;

/**
 * Builds the exact immutable AE-2 V1 semantic registry. The builder itself is
 * fail-closed to the accepted two-capability surface and exact descriptor law;
 * callers cannot weaken metadata or promote another tool into planning authority.
 */
export function buildAeeCapabilityRegistryV1(rawRegistrations: readonly unknown[]): AeeCapabilityRegistryV1 {
  if (!Array.isArray(rawRegistrations) || rawRegistrations.length !== V1_CAPABILITY_COUNT) {
    fail('aee_capability_v1_surface_size_invalid', `AE-2 V1 requires exactly ${V1_CAPABILITY_COUNT} registrations`);
  }

  const registrations = rawRegistrations.map((raw, index) => normalizeRegistration(raw, index));
  const sorted = [...registrations].sort((left, right) => left.descriptor.capabilityId.localeCompare(right.descriptor.capabilityId));
  const seenIds = new Set<string>();
  const seenBindings = new Set<string>();

  for (const { descriptor, binding } of sorted) {
    if (seenIds.has(descriptor.capabilityId)) fail('aee_capability_duplicate_id', `Duplicate capabilityId: ${descriptor.capabilityId}`);
    seenIds.add(descriptor.capabilityId);
    const bindingKey = `${binding.kind}:${binding.toolCapability}`;
    if (seenBindings.has(bindingKey)) fail('aee_capability_duplicate_binding', `Duplicate deterministic binding: ${binding.toolCapability}`);
    seenBindings.add(bindingKey);
  }

  for (const { descriptor, binding } of sorted) {
    const expectedBinding = V1_EXPECTED_BINDING_BY_ID[descriptor.capabilityId];
    const expectedRegistration = V1_EXPECTED_REGISTRATION_BY_ID.get(descriptor.capabilityId);
    if (!expectedBinding || !expectedRegistration) {
      fail('aee_capability_v1_surface_unsupported', `Capability is outside the accepted AE-2 V1 surface: ${descriptor.capabilityId}`);
    }
    if (binding.toolCapability !== expectedBinding) {
      fail('aee_capability_v1_binding_mismatch', `Capability ${descriptor.capabilityId} is bound to an unexpected deterministic tool`);
    }
    assertDeterministicBinding(descriptor, binding);
    if (!sameCanonicalValue(descriptor, expectedRegistration.descriptor)) {
      fail('aee_capability_v1_descriptor_mismatch', `Capability ${descriptor.capabilityId} descriptor differs from the accepted AE-2 V1 contract`);
    }
  }

  for (const requiredId of V1_EXPECTED_REGISTRATION_BY_ID.keys()) {
    if (!seenIds.has(requiredId)) fail('aee_capability_v1_surface_incomplete', `Required AE-2 V1 capability is missing: ${requiredId}`);
  }

  const descriptors = deepFreeze(sorted.map(registration => registration.descriptor));
  const digestInput = sorted.map(registration => ({ descriptor: registration.descriptor, binding: registration.binding }));
  const digest = createHash('sha256').update(DIGEST_DOMAIN).update(JSON.stringify(canonicalValue(digestInput))).digest('hex');
  return deepFreeze({
    schemaVersion: AEE_CAPABILITY_REGISTRY_V1_SCHEMA,
    registryVersion: AEE_CAPABILITY_REGISTRY_V1_VERSION,
    descriptors,
    digest,
  });
}

const DEFAULT_REGISTRY = buildAeeCapabilityRegistryV1(DEFAULT_REGISTRATIONS);
const DEFAULT_BY_ID = new Map<string, AeeCapabilityRegistrationV1>(
  DEFAULT_REGISTRATIONS.map(registration => [registration.descriptor.capabilityId, registration]),
);

export const AEE_CAPABILITY_REGISTRY_V1: AeeCapabilityRegistryV1 = DEFAULT_REGISTRY;

export function listAeeCapabilityDescriptorsV1(): readonly AeeCapabilityDescriptorV1[] {
  return AEE_CAPABILITY_REGISTRY_V1.descriptors;
}

/** Server-internal compiler/testing seam; public planner descriptors never expose bindings. */
export function listAeeCapabilityRegistrationsV1(): readonly AeeCapabilityRegistrationV1[] {
  return DEFAULT_REGISTRATIONS;
}

export function findAeeCapabilityDescriptorV1(capabilityIdValue: string, capabilityVersionValue = 1): AeeCapabilityDescriptorV1 | undefined {
  const capabilityId = semanticCapabilityId(capabilityIdValue, 'capabilityId');
  const capabilityVersion = integer(capabilityVersionValue, 'capabilityVersion', 1, 1_000_000);
  const registration = DEFAULT_BY_ID.get(capabilityId);
  if (!registration || registration.descriptor.capabilityVersion !== capabilityVersion) return undefined;
  return AEE_CAPABILITY_REGISTRY_V1.descriptors.find(descriptor => descriptor.capabilityId === capabilityId);
}

export function requireAeeCapabilityDescriptorV1(capabilityId: string, capabilityVersion = 1): AeeCapabilityDescriptorV1 {
  const descriptor = findAeeCapabilityDescriptorV1(capabilityId, capabilityVersion);
  if (!descriptor) fail('aee_capability_not_registered', `Capability is not registered: ${capabilityId}@${capabilityVersion}`);
  return descriptor;
}

/** Server-internal compiler seam; never expose this binding as planner/browser authority. */
export function requireAeeCapabilityRegistrationV1(capabilityId: string, capabilityVersion = 1): AeeCapabilityRegistrationV1 {
  const descriptor = requireAeeCapabilityDescriptorV1(capabilityId, capabilityVersion);
  const registration = DEFAULT_BY_ID.get(descriptor.capabilityId);
  if (!registration) fail('aee_capability_not_registered', `Capability registration is unavailable: ${descriptor.capabilityId}`);
  return deepFreeze({ descriptor, binding: registration.binding });
}

function normalizeRegistration(raw: unknown, index: number): AeeCapabilityRegistrationV1 {
  const record = exactRecord(raw, REGISTRATION_KEYS, REGISTRATION_KEYS, `registrations[${index}]`);
  const descriptor = normalizeDescriptor(record.descriptor, `registrations[${index}].descriptor`);
  const bindingRaw = exactRecord(record.binding, BINDING_KEYS, BINDING_KEYS, `registrations[${index}].binding`);
  if (bindingRaw.kind !== 'DETERMINISTIC_TOOL') fail('aee_capability_binding_kind_invalid', 'Only accepted deterministic bindings are supported in AE-2 V1');
  return deepFreeze({
    descriptor,
    binding: Object.freeze({
      kind: 'DETERMINISTIC_TOOL' as const,
      toolCapability: text(bindingRaw.toolCapability, `registrations[${index}].binding.toolCapability`, 1, 200),
    }),
  });
}

function normalizeDescriptor(raw: unknown, path: string): AeeCapabilityDescriptorV1 {
  const record = exactRecord(raw, DESCRIPTOR_KEYS, DESCRIPTOR_KEYS, path);
  if (record.schemaVersion !== AEE_CAPABILITY_DESCRIPTOR_V1_SCHEMA) {
    fail('aee_capability_descriptor_schema_unsupported', `schemaVersion must be ${AEE_CAPABILITY_DESCRIPTOR_V1_SCHEMA}`);
  }
  const eligibilityRaw = exactRecord(record.executionEligibility, ELIGIBILITY_KEYS, ELIGIBILITY_KEYS, `${path}.executionEligibility`);
  const inputs = array(record.inputs, `${path}.inputs`, 8).map((inputRaw, inputIndex) => {
    const input = exactRecord(inputRaw, INPUT_KEYS, INPUT_KEYS, `${path}.inputs[${inputIndex}]`);
    const roles = enumSet(input.artifactRoles, CREATIVE_ROLES, `${path}.inputs[${inputIndex}].artifactRoles`, CREATIVE_ROLES.length);
    if (roles.length === 0) fail('aee_capability_input_roles_empty', 'Capability input must admit at least one Artifact role');
    return Object.freeze({
      name: text(input.name, `${path}.inputs[${inputIndex}].name`, 1, 80),
      artifactRoles: roles,
    });
  });
  if (new Set(inputs.map(input => input.name)).size !== inputs.length) fail('aee_capability_input_duplicate', 'Capability input names must be unique');

  const preconditions = enumSet(record.preconditions, PRECONDITION_CLASSES, `${path}.preconditions`, PRECONDITION_CLASSES.length);
  if (preconditions.length === 0) fail('aee_capability_preconditions_empty', 'Capability must declare at least one precondition class');
  const evaluatorHooks = enumSet(record.evaluatorHooks, EVALUATOR_HOOKS, `${path}.evaluatorHooks`, EVALUATOR_HOOKS.length);
  if (evaluatorHooks.length === 0) fail('aee_capability_evaluators_empty', 'Capability must declare at least one evaluator hook');

  const eligibility = Object.freeze({
    deterministic: bool(eligibilityRaw.deterministic, `${path}.executionEligibility.deterministic`),
    local: bool(eligibilityRaw.local, `${path}.executionEligibility.local`),
    cloud: bool(eligibilityRaw.cloud, `${path}.executionEligibility.cloud`),
    hybrid: bool(eligibilityRaw.hybrid, `${path}.executionEligibility.hybrid`),
  });
  if (!eligibility.deterministic || !eligibility.local || eligibility.cloud || eligibility.hybrid) {
    fail('aee_capability_v1_eligibility_invalid', 'AE-2 V1 capabilities must be deterministic local-only semantics');
  }

  return deepFreeze({
    schemaVersion: AEE_CAPABILITY_DESCRIPTOR_V1_SCHEMA,
    capabilityId: semanticCapabilityId(record.capabilityId, `${path}.capabilityId`),
    capabilityVersion: integer(record.capabilityVersion, `${path}.capabilityVersion`, 1, 1_000_000),
    semanticOperation: operation(record.semanticOperation, `${path}.semanticOperation`),
    inputs: Object.freeze(inputs),
    outputArtifactRole: enumValue(record.outputArtifactRole, CREATIVE_ROLES, `${path}.outputArtifactRole`),
    preconditions,
    executionEligibility: eligibility,
    sideEffectClass: enumValue(record.sideEffectClass, SIDE_EFFECT_CLASSES, `${path}.sideEffectClass`),
    resourceClass: enumValue(record.resourceClass, RESOURCE_CLASSES, `${path}.resourceClass`),
    requiredEvidence: enumValue(record.requiredEvidence, EVIDENCE_CLASSES, `${path}.requiredEvidence`),
    readinessClass: enumValue(record.readinessClass, READINESS_CLASSES, `${path}.readinessClass`),
    evaluatorHooks,
    userConfirmation: enumValue(record.userConfirmation, USER_CONFIRMATION_CLASSES, `${path}.userConfirmation`),
  });
}

function assertDeterministicBinding(descriptor: AeeCapabilityDescriptorV1, binding: AeeCapabilityDeterministicBindingV1): void {
  let tool: DeterministicToolDefinition;
  try {
    tool = requireDeterministicToolByCapability(binding.toolCapability);
  } catch {
    fail('aee_capability_binding_unknown', `Deterministic binding is not accepted: ${binding.toolCapability}`);
  }
  if (tool.operation.type !== descriptor.semanticOperation) {
    fail('aee_capability_operation_binding_mismatch', `Capability ${descriptor.capabilityId} semantic operation does not match deterministic tool`);
  }
  if (tool.output.role !== descriptor.outputArtifactRole) {
    fail('aee_capability_output_binding_mismatch', `Capability ${descriptor.capabilityId} output role does not match deterministic tool`);
  }
  if (tool.inputs.length !== descriptor.inputs.length) {
    fail('aee_capability_input_binding_mismatch', `Capability ${descriptor.capabilityId} input count does not match deterministic tool`);
  }
  for (const input of descriptor.inputs) {
    const toolInput = tool.inputs.find(candidate => candidate.name === input.name);
    if (!toolInput || !sameStringSet(toolInput.roles, input.artifactRoles)) {
      fail('aee_capability_input_binding_mismatch', `Capability ${descriptor.capabilityId} input roles do not match deterministic tool`);
    }
  }
}

function semanticCapabilityId(raw: unknown, path: string): string {
  const value = text(raw, path, 1, 160);
  if (!/^bers:capability:[a-z0-9]+(?:-[a-z0-9]+)*:v[1-9][0-9]*$/u.test(value)) {
    fail('aee_capability_id_invalid', `${path} must be a versioned BERS semantic capability ID`);
  }
  if (/(?:^|:|-)(?:local|cloud|provider|model|runtime)(?:$|:|-)/u.test(value)) {
    fail('aee_capability_id_realization_forbidden', `${path} may not encode realization/provider/model semantics`);
  }
  return value;
}

function operation(raw: unknown, path: string): string {
  const value = text(raw, path, 1, 120);
  if (!/^[A-Z][A-Z0-9_]*$/u.test(value)) fail('aee_capability_operation_invalid', `${path} must be an uppercase semantic operation`);
  return value;
}

function exactRecord<Allowed extends readonly string[], Required extends readonly string[]>(
  raw: unknown,
  allowed: Allowed,
  required: Required,
  path: string,
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('aee_capability_exact_schema_violation', `${path} must be a plain object`);
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) fail('aee_capability_exact_schema_violation', `${path} must be a plain object`);
  const record = raw as Record<string, unknown>;
  const allowedSet = new Set<string>(allowed);
  for (const key of Object.keys(record)) if (!allowedSet.has(key)) fail('aee_capability_exact_schema_violation', `${path} contains unsupported key ${key}`);
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(record, key)) fail('aee_capability_exact_schema_violation', `${path} is missing required key ${key}`);
  return record;
}

function array(raw: unknown, path: string, max: number): readonly unknown[] {
  if (!Array.isArray(raw) || raw.length > max) fail('aee_capability_array_invalid', `${path} must be an array of at most ${max} items`);
  for (let index = 0; index < raw.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(raw, index)) fail('aee_capability_array_invalid', `${path} must be dense`);
  }
  return raw;
}

function enumSet<const Values extends readonly string[]>(raw: unknown, allowed: Values, path: string, max: number): readonly Values[number][] {
  const values = array(raw, path, max).map((value, index) => enumValue(value, allowed, `${path}[${index}]`));
  const unique = [...new Set(values)].sort();
  if (unique.length !== values.length) fail('aee_capability_set_duplicate', `${path} contains duplicates`);
  return Object.freeze(unique) as readonly Values[number][];
}

function enumValue<const Values extends readonly string[]>(raw: unknown, allowed: Values, path: string): Values[number] {
  if (typeof raw !== 'string' || !allowed.includes(raw as Values[number])) fail('aee_capability_enum_invalid', `${path} is unsupported`);
  return raw as Values[number];
}

function integer(raw: unknown, path: string, min: number, max: number): number {
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < min || raw > max) fail('aee_capability_integer_invalid', `${path} must be an integer in range`);
  return raw;
}

function bool(raw: unknown, path: string): boolean {
  if (typeof raw !== 'boolean') fail('aee_capability_boolean_invalid', `${path} must be boolean`);
  return raw;
}

function text(raw: unknown, path: string, min: number, max: number): string {
  if (typeof raw !== 'string') fail('aee_capability_text_invalid', `${path} must be a string`);
  const value = raw.trim();
  if (value.length < min || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail('aee_capability_text_invalid', `${path} is invalid`);
  return value;
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.length === rightSorted.length && leftSorted.every((value, index) => value === rightSorted[index]);
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)]));
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

function fail(code: string, message: string): never { throw new AeeCapabilityRegistryV1Error(code, message); }
