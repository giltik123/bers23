import type { PlanningExecutionPolicy } from '../../canonical/contracts';
import type { DurableModelFleet, FleetState, FleetVersion } from '../lifecycle/DurableModelFleet';
import type { DeviceCapabilityProfile, ExecutionTarget, HashPort, RuntimeCapabilities } from '../types';

export const HSME_PACK_V1_SCHEMA = 'BERS_HSME_PACK_V1' as const;
export const HSME_PACK_V1_DIGEST_DOMAIN = 'bers:hsme:pack:v1\0' as const;

const ROOT_ROLES = Object.freeze(['BASE', 'EXPERT', 'AUXILIARY'] as const);
const ROUTING_MODES = Object.freeze(['SHARED_ONLY', 'ADAPTER_TOP1', 'ADAPTER_TOP2'] as const);
const EXECUTION_TARGETS = Object.freeze(['LOCAL', 'CLOUD', 'HYBRID', 'BLOCKED'] as const);
const EXECUTION_POLICIES = Object.freeze(['LOCAL_ONLY', 'CLOUD_ALLOWED', 'CLOUD_PREFERRED', 'AUTO'] as const);

export type HsmePackRootRoleV1 = typeof ROOT_ROLES[number];
export type HsmeRoutingModeV1 = typeof ROUTING_MODES[number];
export type HsmePackReadinessStatusV1 = 'READY' | 'PREPARE_REQUIRED' | 'BLOCKED';
export type HsmePackRootStatusV1 =
  | 'READY' | 'MISSING' | 'NOT_ACTIVE' | 'NOT_READY' | 'QUARANTINED' | 'INTEGRITY_MISMATCH'
  | 'PLATFORM_UNKNOWN' | 'PLATFORM_UNSUPPORTED' | 'RUNTIME_UNKNOWN' | 'RUNTIME_UNAVAILABLE';

export type HsmePackRootV1 = Readonly<{
  role: HsmePackRootRoleV1;
  modelId: string;
  version: string;
  sha256: string;
  expertId?: string;
}>;

export type HsmePackDescriptorV1 = Readonly<{
  schemaVersion: typeof HSME_PACK_V1_SCHEMA;
  packId: string;
  packVersion: string;
  capabilities: readonly string[];
  roots: readonly HsmePackRootV1[];
  routing: Readonly<{ mode: HsmeRoutingModeV1; maxActiveExperts: number }>;
  resources: Readonly<{ peakMemoryBytes: number; maxResidentBytes: number; maxPrefetchBytes: number }>;
}>;

export type HsmeCoreAdmissionV1 = Readonly<{
  target: ExecutionTarget;
  policy: PlanningExecutionPolicy;
  localSubgraphAdmitted: boolean;
}>;

export type HsmePackReadinessRequestV1 = Readonly<{
  descriptor: HsmePackDescriptorV1;
  admission: HsmeCoreAdmissionV1;
  device: DeviceCapabilityProfile;
  runtimes: RuntimeCapabilities;
}>;

export type HsmePackRootEvidenceV1 = Readonly<{
  role: HsmePackRootRoleV1;
  identity: string;
  sha256: string;
  expertId?: string;
  status: HsmePackRootStatusV1;
  runtime?: string;
}>;

export type HsmePackReadinessEvidenceV1 = Readonly<{
  schemaVersion: 1;
  descriptorId: string;
  status: HsmePackReadinessStatusV1;
  coreTarget: ExecutionTarget;
  executionPolicy: PlanningExecutionPolicy;
  fleetRevision: number;
  reasons: readonly string[];
  roots: readonly HsmePackRootEvidenceV1[];
  resourceEvidence: Readonly<{ requiredPeakMemoryBytes: number; availableRamBytes: number | 'UNKNOWN' }>;
}>;

export class HsmePackV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmePackV1Error';
    this.code = code;
  }
}

const DESCRIPTOR_KEYS = Object.freeze(['schemaVersion', 'packId', 'packVersion', 'capabilities', 'roots', 'routing', 'resources']);
const ROOT_KEYS = Object.freeze(['role', 'modelId', 'version', 'sha256', 'expertId']);
const ROUTING_KEYS = Object.freeze(['mode', 'maxActiveExperts']);
const RESOURCE_KEYS = Object.freeze(['peakMemoryBytes', 'maxResidentBytes', 'maxPrefetchBytes']);
const ADMISSION_KEYS = Object.freeze(['target', 'policy', 'localSubgraphAdmitted']);

/**
 * HSME-1 composition identity only. Trust for every representation byte remains owned by
 * DurableModelFleet/ModelManifestVerifier. URI, signature, runtime and platform metadata are
 * intentionally absent so HSME cannot create a second model-provenance authority.
 */
export function normalizeHsmePackDescriptorV1(raw: unknown): HsmePackDescriptorV1 {
  const descriptor = exactRecord(raw, DESCRIPTOR_KEYS, DESCRIPTOR_KEYS, 'descriptor');
  if (descriptor.schemaVersion !== HSME_PACK_V1_SCHEMA) {
    fail('hsme_pack_schema_unsupported', `schemaVersion must be ${HSME_PACK_V1_SCHEMA}`);
  }
  const routingRecord = exactRecord(descriptor.routing, ROUTING_KEYS, ROUTING_KEYS, 'routing');
  const resourceRecord = exactRecord(descriptor.resources, RESOURCE_KEYS, RESOURCE_KEYS, 'resources');
  const roots = normalizeRoots(descriptor.roots);
  const routing = Object.freeze({
    mode: enumValue(routingRecord.mode, ROUTING_MODES, 'routing.mode'),
    maxActiveExperts: boundedInteger(routingRecord.maxActiveExperts, 'routing.maxActiveExperts', 0, 2),
  });
  validateRouting(roots, routing);

  const peakMemoryBytes = boundedInteger(resourceRecord.peakMemoryBytes, 'resources.peakMemoryBytes', 1, Number.MAX_SAFE_INTEGER);
  const maxResidentBytes = boundedInteger(resourceRecord.maxResidentBytes, 'resources.maxResidentBytes', 1, Number.MAX_SAFE_INTEGER);
  const maxPrefetchBytes = boundedInteger(resourceRecord.maxPrefetchBytes, 'resources.maxPrefetchBytes', 0, Number.MAX_SAFE_INTEGER);
  if (maxResidentBytes > peakMemoryBytes) fail('hsme_pack_resource_invalid', 'maxResidentBytes cannot exceed peakMemoryBytes');
  if (maxPrefetchBytes > peakMemoryBytes) fail('hsme_pack_resource_invalid', 'maxPrefetchBytes cannot exceed peakMemoryBytes');

  return deepFreeze({
    schemaVersion: HSME_PACK_V1_SCHEMA,
    packId: boundedIdentifier(descriptor.packId, 'packId', 120),
    packVersion: boundedIdentifier(descriptor.packVersion, 'packVersion', 80),
    capabilities: normalizeStringSet(descriptor.capabilities, 'capabilities', 32, 100),
    roots,
    routing,
    resources: Object.freeze({ peakMemoryBytes, maxResidentBytes, maxPrefetchBytes }),
  });
}

export function normalizeHsmeCoreAdmissionV1(raw: unknown): HsmeCoreAdmissionV1 {
  const admission = exactRecord(raw, ADMISSION_KEYS, ADMISSION_KEYS, 'admission');
  if (!EXECUTION_TARGETS.includes(admission.target as ExecutionTarget)
      || !EXECUTION_POLICIES.includes(admission.policy as PlanningExecutionPolicy)
      || typeof admission.localSubgraphAdmitted !== 'boolean') {
    fail('hsme_core_admission_invalid', 'Canonical Core admission input is invalid');
  }
  return Object.freeze({
    target: admission.target as ExecutionTarget,
    policy: admission.policy as PlanningExecutionPolicy,
    localSubgraphAdmitted: admission.localSubgraphAdmitted,
  });
}

export function serializeHsmePackDescriptorV1(descriptor: HsmePackDescriptorV1): string {
  return JSON.stringify(canonicalValue(normalizeHsmePackDescriptorV1(descriptor)));
}

/** Browser/mobile-safe digest through the existing HashPort; no Node crypto dependency. */
export async function hsmePackDescriptorV1Digest(descriptor: HsmePackDescriptorV1, hash: HashPort): Promise<string> {
  const bytes = new TextEncoder().encode(`${HSME_PACK_V1_DIGEST_DOMAIN}${serializeHsmePackDescriptorV1(descriptor)}`);
  const digest = await hash.sha256(bytes);
  if (!/^[0-9a-f]{64}$/.test(digest)) fail('hsme_pack_hash_port_invalid', 'HashPort must return lowercase SHA-256 hex');
  return digest;
}

/**
 * Read-only control plane: by type this dependency exposes only DurableModelFleet.state().
 * HSME cannot install, activate, quarantine or remove representations and never proposes CLOUD.
 */
export class HsmePackReadinessPlannerV1 {
  private readonly fleet: Pick<DurableModelFleet, 'state'>;
  constructor(fleet: Pick<DurableModelFleet, 'state'>) { this.fleet = fleet; }

  async plan(request: HsmePackReadinessRequestV1): Promise<HsmePackReadinessEvidenceV1> {
    const descriptor = normalizeHsmePackDescriptorV1(request.descriptor);
    const fleet = await this.fleet.state();
    return evaluateHsmePackReadinessV1(descriptor, fleet, request.admission, request.device, request.runtimes);
  }
}

export function evaluateHsmePackReadinessV1(
  descriptor: HsmePackDescriptorV1,
  fleet: FleetState,
  admission: HsmeCoreAdmissionV1,
  device: DeviceCapabilityProfile,
  runtimes: RuntimeCapabilities,
): HsmePackReadinessEvidenceV1 {
  const pack = normalizeHsmePackDescriptorV1(descriptor);
  const coreAdmission = normalizeHsmeCoreAdmissionV1(admission);
  const reasons: string[] = [];
  let blocked = false;
  let prepareRequired = false;

  if (!fleet || fleet.schemaVersion !== 1 || !Number.isSafeInteger(fleet.revision) || fleet.revision < 0) {
    fail('hsme_fleet_state_invalid', 'DurableModelFleet returned an unsupported state');
  }

  if (coreAdmission.target === 'BLOCKED') {
    blocked = true; reasons.push('CORE_TARGET_BLOCKED');
  } else if (coreAdmission.target === 'CLOUD' || !coreAdmission.localSubgraphAdmitted) {
    blocked = true; reasons.push('CORE_LOCAL_SUBGRAPH_NOT_ADMITTED');
  }
  if (coreAdmission.policy === 'LOCAL_ONLY' && coreAdmission.target === 'HYBRID') {
    blocked = true; reasons.push('CORE_POLICY_TARGET_MISMATCH');
  }

  const rootEvidence = pack.roots.map(root => {
    const result = inspectRoot(root, fleet, device, runtimes);
    if (result.status === 'MISSING' || result.status === 'NOT_ACTIVE' || result.status === 'NOT_READY') prepareRequired = true;
    if (['QUARANTINED', 'INTEGRITY_MISMATCH', 'PLATFORM_UNKNOWN', 'PLATFORM_UNSUPPORTED', 'RUNTIME_UNKNOWN', 'RUNTIME_UNAVAILABLE'].includes(result.status)) blocked = true;
    if (result.status !== 'READY') reasons.push(`ROOT_${result.status}:${result.identity}`);
    return result;
  });

  let availableRamBytes: number | 'UNKNOWN' = 'UNKNOWN';
  if (device.ramMb === 'UNKNOWN') {
    blocked = true; reasons.push('DEVICE_RAM_UNKNOWN');
  } else {
    availableRamBytes = device.ramMb * 1024 * 1024;
    if (!Number.isSafeInteger(availableRamBytes) || availableRamBytes < pack.resources.peakMemoryBytes) {
      blocked = true; reasons.push('DEVICE_PEAK_MEMORY_INSUFFICIENT');
    }
  }
  if (device.thermalState === 'HIGH' || device.thermalState === 'CRITICAL') {
    blocked = true; reasons.push('DEVICE_THERMAL_LIMIT');
  }
  if (device.ramPressure === 'HIGH' || device.ramPressure === 'CRITICAL') {
    blocked = true; reasons.push('DEVICE_RAM_PRESSURE');
  }
  if (device.backgroundRestricted === true) {
    blocked = true; reasons.push('DEVICE_BACKGROUND_RESTRICTED');
  }
  if (device.batteryPercent !== 'UNKNOWN' && device.powerState !== 'CHARGING' && device.batteryPercent < 15) {
    blocked = true; reasons.push('DEVICE_BATTERY_LOW');
  }

  const status: HsmePackReadinessStatusV1 = blocked ? 'BLOCKED' : prepareRequired ? 'PREPARE_REQUIRED' : 'READY';
  return deepFreeze({
    schemaVersion: 1,
    descriptorId: `${pack.packId}@${pack.packVersion}`,
    status,
    coreTarget: coreAdmission.target,
    executionPolicy: coreAdmission.policy,
    fleetRevision: fleet.revision,
    reasons: Object.freeze([...new Set(reasons)].sort()),
    roots: Object.freeze(rootEvidence),
    resourceEvidence: Object.freeze({ requiredPeakMemoryBytes: pack.resources.peakMemoryBytes, availableRamBytes }),
  });
}

function inspectRoot(
  root: HsmePackRootV1,
  fleet: FleetState,
  device: DeviceCapabilityProfile,
  runtimes: RuntimeCapabilities,
): HsmePackRootEvidenceV1 {
  const identity = `${root.modelId}@${root.version}`;
  const model = fleet.models[root.modelId];
  const record = model?.versions[root.version];
  const base = { role: root.role, identity, sha256: root.sha256, ...(root.expertId ? { expertId: root.expertId } : {}) };
  if (!record) return Object.freeze({ ...base, status: 'MISSING' as const });
  if (!rootIntegrityMatches(root, record)) return Object.freeze({ ...base, status: 'INTEGRITY_MISMATCH' as const, runtime: record.manifest.runtime });
  if (record.status === 'QUARANTINED') return Object.freeze({ ...base, status: 'QUARANTINED' as const, runtime: record.manifest.runtime });
  if (record.status !== 'READY') return Object.freeze({ ...base, status: 'NOT_READY' as const, runtime: record.manifest.runtime });
  if (model?.activeVersion !== root.version) return Object.freeze({ ...base, status: 'NOT_ACTIVE' as const, runtime: record.manifest.runtime });
  if (device.platform === 'UNKNOWN') return Object.freeze({ ...base, status: 'PLATFORM_UNKNOWN' as const, runtime: record.manifest.runtime });
  if (!record.manifest.supportedPlatforms.includes(device.platform)) return Object.freeze({ ...base, status: 'PLATFORM_UNSUPPORTED' as const, runtime: record.manifest.runtime });
  const runtime = runtimes[record.manifest.runtime];
  if (runtime === 'UNKNOWN' || runtime === undefined) return Object.freeze({ ...base, status: 'RUNTIME_UNKNOWN' as const, runtime: record.manifest.runtime });
  if (runtime !== true) return Object.freeze({ ...base, status: 'RUNTIME_UNAVAILABLE' as const, runtime: record.manifest.runtime });
  return Object.freeze({ ...base, status: 'READY' as const, runtime: record.manifest.runtime });
}

function rootIntegrityMatches(root: HsmePackRootV1, record: FleetVersion): boolean {
  return record.modelId === root.modelId
    && record.version === root.version
    && record.expectedSha256 === root.sha256
    && record.manifest.modelId === root.modelId
    && record.manifest.version === root.version
    && record.manifest.sha256 === root.sha256
    && record.contentHash === root.sha256;
}

function normalizeRoots(raw: unknown): readonly HsmePackRootV1[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 32) fail('hsme_pack_roots_invalid', 'roots must contain 1-32 entries');
  const roots = raw.map((value, index) => normalizeRoot(value, index));
  const identities = new Set<string>();
  const expertIds = new Set<string>();
  let baseCount = 0;
  for (const root of roots) {
    const identity = `${root.modelId}@${root.version}`;
    if (identities.has(identity)) fail('hsme_pack_root_duplicate', `duplicate fleet root ${identity}`);
    identities.add(identity);
    if (root.role === 'BASE') baseCount += 1;
    if (root.expertId) {
      if (expertIds.has(root.expertId)) fail('hsme_pack_expert_duplicate', `duplicate expertId ${root.expertId}`);
      expertIds.add(root.expertId);
    }
  }
  if (baseCount !== 1) fail('hsme_pack_base_invalid', 'exactly one BASE fleet root is required');
  return Object.freeze(roots.sort((a, b) => rootSortKey(a).localeCompare(rootSortKey(b))));
}

function normalizeRoot(raw: unknown, index: number): HsmePackRootV1 {
  const record = exactRecord(raw, ROOT_KEYS, ['role', 'modelId', 'version', 'sha256'], `roots[${index}]`);
  const role = enumValue(record.role, ROOT_ROLES, `roots[${index}].role`);
  const hasExpertId = Object.hasOwn(record, 'expertId');
  if (role === 'EXPERT' && !hasExpertId) fail('hsme_pack_expert_id_required', `roots[${index}] EXPERT requires expertId`);
  if (role !== 'EXPERT' && hasExpertId) fail('hsme_pack_expert_id_forbidden', `roots[${index}] non-EXPERT cannot carry expertId`);
  return Object.freeze({
    role,
    modelId: boundedIdentifier(record.modelId, `roots[${index}].modelId`, 160),
    version: boundedIdentifier(record.version, `roots[${index}].version`, 80),
    sha256: sha256Value(record.sha256, `roots[${index}].sha256`),
    ...(role === 'EXPERT' ? { expertId: boundedIdentifier(record.expertId, `roots[${index}].expertId`, 120) } : {}),
  });
}

function validateRouting(roots: readonly HsmePackRootV1[], routing: Readonly<{ mode: HsmeRoutingModeV1; maxActiveExperts: number }>): void {
  const experts = roots.filter(root => root.role === 'EXPERT').length;
  if (routing.mode === 'SHARED_ONLY' && (experts !== 0 || routing.maxActiveExperts !== 0)) {
    fail('hsme_pack_routing_invalid', 'SHARED_ONLY requires no expert roots and maxActiveExperts=0');
  }
  if (routing.mode === 'ADAPTER_TOP1' && (experts < 1 || routing.maxActiveExperts !== 1)) {
    fail('hsme_pack_routing_invalid', 'ADAPTER_TOP1 requires at least one expert and maxActiveExperts=1');
  }
  if (routing.mode === 'ADAPTER_TOP2' && (experts < 2 || routing.maxActiveExperts !== 2)) {
    fail('hsme_pack_routing_invalid', 'ADAPTER_TOP2 requires at least two experts and maxActiveExperts=2');
  }
}

function rootSortKey(root: HsmePackRootV1): string {
  return `${root.role}:${root.modelId}:${root.version}:${root.expertId ?? ''}`;
}

function exactRecord(raw: unknown, allowed: readonly string[], required: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('hsme_pack_object_required', `${path} must be a plain object`);
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) fail('hsme_pack_non_plain_object', `${path} must be a plain data object`);
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(record, key))) {
    fail('hsme_pack_exact_schema_violation', `${path} accepts exactly the documented keys`);
  }
  return record;
}

function normalizeStringSet(raw: unknown, path: string, maxItems: number, maxLength: number): readonly string[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > maxItems) fail('hsme_pack_string_set_invalid', `${path} must contain 1-${maxItems} strings`);
  const values = raw.map((value, index) => boundedIdentifier(value, `${path}[${index}]`, maxLength));
  return Object.freeze([...new Set(values)].sort((a, b) => a.localeCompare(b)));
}

function boundedIdentifier(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string') fail('hsme_pack_string_required', `${path} must be a string`);
  const text = value.trim();
  if (!text || text.length > maxLength || !/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(text)) {
    fail('hsme_pack_identifier_invalid', `${path} is not a supported identifier`);
  }
  return text;
}

function boundedInteger(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    fail('hsme_pack_integer_invalid', `${path} must be a safe integer in [${min}, ${max}]`);
  }
  return value;
}

function sha256Value(value: unknown, path: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail('hsme_pack_sha256_invalid', `${path} must be lowercase SHA-256 hex`);
  return value;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value as T[number])) fail('hsme_pack_enum_invalid', `${path} is unsupported`);
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

function fail(code: string, message: string): never { throw new HsmePackV1Error(code, message); }
