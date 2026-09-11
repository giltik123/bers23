import type {
  DeviceCapabilityProfile,
  HashPort,
  ModelManifest,
  RuntimeCapabilities,
  RuntimeKind,
} from '../types';
import {
  hsmePackDescriptorV1Digest,
  normalizeHsmePackDescriptorV1,
  type HsmePackDescriptorV1,
  type HsmePackReadinessEvidenceV1,
  type HsmePackRootStatusV1,
  type HsmePackRootV1,
} from './HsmePackV1';

export const HSME_PREPARATION_V1_SCHEMA = 'BERS_HSME_PREPARATION_V1' as const;
export const HSME_PREPARATION_V1_DIGEST_DOMAIN = 'bers:hsme:preparation:v1\0' as const;
export const HSME_PREPARATION_EVIDENCE_V1_SCHEMA = 'BERS_HSME_PREPARATION_EVIDENCE_V1' as const;

const PLACEMENTS = Object.freeze(['CPU', 'GPU', 'NPU', 'FLASH_ONLY', 'DEFERRED'] as const);
const CACHE_CLASSES = Object.freeze(['MISS', 'FLASH_HIT', 'RAM_HIT', 'ACCELERATOR_HIT'] as const);
const PLAN_STATUSES = Object.freeze(['READY', 'PREPARE_REQUIRED', 'BLOCKED'] as const);
const LIFECYCLE_REQUIREMENTS = Object.freeze(['NONE', 'ENSURE_READY_ACTIVE'] as const);
const SAFE_MANIFEST_STATUSES = new Set(['AVAILABLE', 'INSTALLED', 'READY']);

export type HsmePlacementV1 = typeof PLACEMENTS[number];
export type HsmeCacheClassV1 = typeof CACHE_CLASSES[number];
export type HsmePreparationStatusV1 = typeof PLAN_STATUSES[number];
export type HsmeLifecycleRequirementV1 = typeof LIFECYCLE_REQUIREMENTS[number];

export type HsmePreparationSelectionV1 = Readonly<{
  activeExpertIds: readonly string[];
}>;

export type HsmeResidencyRootStateV1 = Readonly<{
  modelId: string;
  version: string;
  sha256: string;
  ramResidentBytes: number;
  acceleratorResidentBytes: number;
}>;

export type HsmeResidencySnapshotV1 = Readonly<{
  schemaVersion: 1;
  descriptorDigest: string;
  fleetRevision: number;
  budgets: Readonly<{
    ramBytes: number;
    acceleratorBytes: number;
    storageFreeBytes: number | 'UNKNOWN';
  }>;
  roots: readonly HsmeResidencyRootStateV1[];
}>;

export type HsmePreparationRequestV1 = Readonly<{
  descriptor: HsmePackDescriptorV1;
  readiness: HsmePackReadinessEvidenceV1;
  device: DeviceCapabilityProfile;
  runtimes: RuntimeCapabilities;
  residency: HsmeResidencySnapshotV1;
  selection: HsmePreparationSelectionV1;
}>;

export type HsmePreparationRootPlanV1 = Readonly<{
  role: HsmePackRootV1['role'];
  identity: string;
  sha256: string;
  expertId?: string;
  readinessStatus: HsmePackRootStatusV1;
  lifecycleRequirement: HsmeLifecycleRequirementV1;
  runtime: RuntimeKind;
  placement: HsmePlacementV1;
  cache: HsmeCacheClassV1;
  modelBytes: number;
  networkAcquisitionBytes: number;
  storageReservationBytes: number;
  flashToRamBytes: number;
  ramToAcceleratorBytes: number;
  prefetchBytes: 0;
}>;

export type HsmePreparationPlanV1 = Readonly<{
  schemaVersion: typeof HSME_PREPARATION_V1_SCHEMA;
  descriptorId: string;
  descriptorDigest: string;
  fleetRevision: number;
  status: HsmePreparationStatusV1;
  reasons: readonly string[];
  selection: HsmePreparationSelectionV1;
  roots: readonly HsmePreparationRootPlanV1[];
  totals: Readonly<{
    networkAcquisitionBytes: number;
    storageReservationBytes: number;
    residentModelBytes: number;
    ramWorkingBytes: number;
    acceleratorResidentBytes: number;
    flashToRamBytes: number;
    ramToAcceleratorBytes: number;
    prefetchBytes: 0;
    networkBytesDuringExecution: 0;
  }>;
}>;

export type HsmePreparationEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_PREPARATION_EVIDENCE_V1_SCHEMA;
  descriptorDigest: string;
  fleetRevision: number;
  planDigest: string;
  measured: Readonly<{
    networkAcquisitionBytes: number;
    flashToRamBytes: number;
    ramToAcceleratorBytes: number;
    prefetchBytes: number;
    networkBytesDuringExecution: 0;
  }>;
}>;

export interface HsmeCanonicalManifestResolverV1 {
  resolve(modelId: string, version: string): ModelManifest | undefined;
}

export class HsmePreparationV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmePreparationV1Error';
    this.code = code;
  }
}

/**
 * Pure HSME-1b planner. It can read canonical manifest metadata, but owns no fleet mutation,
 * provider selection, cloud fallback, billing, Project or Artifact authority.
 */
export class HsmePreparationPlannerV1 {
  private readonly manifests: HsmeCanonicalManifestResolverV1;
  private readonly hash: HashPort;

  constructor(manifests: HsmeCanonicalManifestResolverV1, hash: HashPort) {
    this.manifests = manifests;
    this.hash = hash;
  }

  async plan(request: HsmePreparationRequestV1): Promise<HsmePreparationPlanV1> {
    return planHsmePreparationV1(request, this.manifests, this.hash);
  }
}

export async function planHsmePreparationV1(
  request: HsmePreparationRequestV1,
  manifests: HsmeCanonicalManifestResolverV1,
  hash: HashPort,
): Promise<HsmePreparationPlanV1> {
  const descriptor = normalizeHsmePackDescriptorV1(request.descriptor);
  const descriptorDigest = await hsmePackDescriptorV1Digest(descriptor, hash);
  const residency = normalizeHsmeResidencySnapshotV1(request.residency);
  const selection = normalizeHsmePreparationSelectionV1(request.selection, descriptor);
  validateReadinessBinding(descriptor, descriptorDigest, request.readiness, residency);
  validateResidencyBinding(descriptor, residency, request.device);

  const readinessByIdentity = new Map(request.readiness.roots.map(root => [root.identity, root] as const));
  const residencyByIdentity = new Map(residency.roots.map(root => [identity(root), root] as const));
  const reasons = new Set<string>();
  const roots: HsmePreparationRootPlanV1[] = [];
  let hardBlocked = request.readiness.status === 'BLOCKED';
  if (hardBlocked) for (const reason of request.readiness.reasons) reasons.add(`READINESS:${reason}`);

  let requiredResidentModelBytes = 0;
  let requiredCpuResidentBytes = 0;
  let requiredAcceleratorBytes = 0;
  let largestAcceleratorStagingBytes = 0;

  for (const root of descriptor.roots) {
    const rootIdentity = identity(root);
    const readiness = readinessByIdentity.get(rootIdentity)!;
    const manifest = resolveManifest(root, manifests);
    const runtimeCompatible = manifestCompatible(manifest, request.device, request.runtimes);
    if (!runtimeCompatible.ok) {
      hardBlocked = true;
      reasons.add(`${runtimeCompatible.reason}:${rootIdentity}`);
    }

    const active = root.role !== 'EXPERT' || selection.activeExpertIds.includes(root.expertId!);
    const placement = active && runtimeCompatible.ok ? placementFor(manifest.runtime) : root.role === 'EXPERT' && !active ? 'FLASH_ONLY' : 'DEFERRED';
    const residencyRoot = residencyByIdentity.get(rootIdentity);
    const lifecycleRequirement: HsmeLifecycleRequirementV1 = readiness.status === 'READY' ? 'NONE' : 'ENSURE_READY_ACTIVE';
    const needsLifecycle = lifecycleRequirement !== 'NONE';
    const networkAcquisitionBytes = readiness.status === 'MISSING' || readiness.status === 'NOT_READY'
      ? manifest.sizeBytes
      : 0;
    const storageReservationBytes = networkAcquisitionBytes === 0
      ? 0
      : safeMultiply(manifest.sizeBytes, 2, 'storage reservation');

    let cache: HsmeCacheClassV1 = readiness.status === 'READY' ? 'FLASH_HIT' : 'MISS';
    let flashToRamBytes = 0;
    let ramToAcceleratorBytes = 0;

    if (readiness.status === 'READY' && active && runtimeCompatible.ok) {
      requiredResidentModelBytes = safeAdd(requiredResidentModelBytes, manifest.sizeBytes, 'resident model bytes');
      if (placement === 'CPU') {
        requiredCpuResidentBytes = safeAdd(requiredCpuResidentBytes, manifest.sizeBytes, 'CPU resident bytes');
        if ((residencyRoot?.ramResidentBytes ?? 0) >= manifest.sizeBytes) cache = 'RAM_HIT';
        else flashToRamBytes = manifest.sizeBytes;
      } else if (placement === 'GPU' || placement === 'NPU') {
        requiredAcceleratorBytes = safeAdd(requiredAcceleratorBytes, manifest.sizeBytes, 'accelerator resident bytes');
        if ((residencyRoot?.acceleratorResidentBytes ?? 0) >= manifest.sizeBytes) {
          cache = 'ACCELERATOR_HIT';
        } else if ((residencyRoot?.ramResidentBytes ?? 0) >= manifest.sizeBytes) {
          cache = 'RAM_HIT';
          ramToAcceleratorBytes = manifest.sizeBytes;
        } else {
          flashToRamBytes = manifest.sizeBytes;
          ramToAcceleratorBytes = manifest.sizeBytes;
          largestAcceleratorStagingBytes = Math.max(largestAcceleratorStagingBytes, manifest.sizeBytes);
        }
      }
    }

    roots.push(freezeRootPlan({
      role: root.role,
      identity: rootIdentity,
      sha256: root.sha256,
      ...(root.expertId ? { expertId: root.expertId } : {}),
      readinessStatus: readiness.status,
      lifecycleRequirement,
      runtime: manifest.runtime,
      placement,
      cache,
      modelBytes: manifest.sizeBytes,
      networkAcquisitionBytes,
      storageReservationBytes,
      flashToRamBytes,
      ramToAcceleratorBytes,
      prefetchBytes: 0,
    }));

    if (needsLifecycle) reasons.add(`FLEET_ROOT_PREPARATION_REQUIRED:${rootIdentity}`);
  }

  const totals = sumTotals(roots, requiredResidentModelBytes, requiredCpuResidentBytes, requiredAcceleratorBytes, largestAcceleratorStagingBytes);

  if (totals.residentModelBytes > descriptor.resources.maxResidentBytes) {
    hardBlocked = true;
    reasons.add('PACK_MAX_RESIDENT_BYTES_EXCEEDED');
  }
  if (totals.ramWorkingBytes > residency.budgets.ramBytes) {
    hardBlocked = true;
    reasons.add('RUNTIME_RAM_BUDGET_EXCEEDED');
  }
  if (totals.acceleratorResidentBytes > residency.budgets.acceleratorBytes) {
    hardBlocked = true;
    reasons.add('RUNTIME_ACCELERATOR_BUDGET_EXCEEDED');
  }
  if (totals.storageReservationBytes > 0) {
    const deviceStorage = request.device.storageFreeBytes;
    if (residency.budgets.storageFreeBytes === 'UNKNOWN' || deviceStorage === 'UNKNOWN') {
      hardBlocked = true;
      reasons.add('RUNTIME_STORAGE_BUDGET_UNKNOWN');
    } else {
      const available = Math.min(residency.budgets.storageFreeBytes, deviceStorage);
      if (totals.storageReservationBytes > available) {
        hardBlocked = true;
        reasons.add('RUNTIME_STORAGE_BUDGET_EXCEEDED');
      }
    }
  }

  const materializationPending = roots.some(root => root.lifecycleRequirement !== 'NONE'
    || root.flashToRamBytes > 0
    || root.ramToAcceleratorBytes > 0);
  const status: HsmePreparationStatusV1 = hardBlocked ? 'BLOCKED' : materializationPending ? 'PREPARE_REQUIRED' : 'READY';

  return deepFreeze({
    schemaVersion: HSME_PREPARATION_V1_SCHEMA,
    descriptorId: `${descriptor.packId}@${descriptor.packVersion}`,
    descriptorDigest,
    fleetRevision: request.readiness.fleetRevision,
    status,
    reasons: Object.freeze([...reasons].sort()),
    selection,
    roots: Object.freeze(roots),
    totals,
  });
}

export function normalizeHsmePreparationSelectionV1(
  raw: unknown,
  descriptor: HsmePackDescriptorV1,
): HsmePreparationSelectionV1 {
  const record = exactRecord(raw, ['activeExpertIds'], ['activeExpertIds'], 'selection');
  if (!Array.isArray(record.activeExpertIds)) fail('hsme_preparation_selection_invalid', 'activeExpertIds must be an array');
  const ids = record.activeExpertIds.map((value, index) => boundedIdentifier(value, `activeExpertIds[${index}]`, 120));
  if (new Set(ids).size !== ids.length) fail('hsme_preparation_selection_invalid', 'activeExpertIds must not contain duplicates');
  const normalized = [...ids].sort();
  const experts = new Set(descriptor.roots.filter(root => root.role === 'EXPERT').map(root => root.expertId!));
  if (normalized.some(id => !experts.has(id))) fail('hsme_preparation_selection_invalid', 'activeExpertIds contains an unknown expert');
  if (descriptor.routing.mode === 'SHARED_ONLY' && normalized.length !== 0) {
    fail('hsme_preparation_selection_invalid', 'SHARED_ONLY cannot select experts');
  }
  if (descriptor.routing.mode === 'ADAPTER_TOP1' && normalized.length !== 1) {
    fail('hsme_preparation_selection_invalid', 'ADAPTER_TOP1 requires exactly one active expert');
  }
  if (descriptor.routing.mode === 'ADAPTER_TOP2' && normalized.length !== 2) {
    fail('hsme_preparation_selection_invalid', 'ADAPTER_TOP2 requires exactly two active experts');
  }
  return Object.freeze({ activeExpertIds: Object.freeze(normalized) });
}

export function normalizeHsmeResidencySnapshotV1(raw: unknown): HsmeResidencySnapshotV1 {
  const record = exactRecord(raw, ['schemaVersion', 'descriptorDigest', 'fleetRevision', 'budgets', 'roots'], ['schemaVersion', 'descriptorDigest', 'fleetRevision', 'budgets', 'roots'], 'residency');
  if (record.schemaVersion !== 1) fail('hsme_residency_schema_unsupported', 'residency.schemaVersion must be 1');
  const descriptorDigest = sha256Value(record.descriptorDigest, 'residency.descriptorDigest');
  const fleetRevision = boundedInteger(record.fleetRevision, 'residency.fleetRevision', 0, Number.MAX_SAFE_INTEGER);
  const budgetsRecord = exactRecord(record.budgets, ['ramBytes', 'acceleratorBytes', 'storageFreeBytes'], ['ramBytes', 'acceleratorBytes', 'storageFreeBytes'], 'residency.budgets');
  const storageFreeBytes = budgetsRecord.storageFreeBytes === 'UNKNOWN'
    ? 'UNKNOWN' as const
    : boundedInteger(budgetsRecord.storageFreeBytes, 'residency.budgets.storageFreeBytes', 0, Number.MAX_SAFE_INTEGER);
  const budgets = Object.freeze({
    ramBytes: boundedInteger(budgetsRecord.ramBytes, 'residency.budgets.ramBytes', 0, Number.MAX_SAFE_INTEGER),
    acceleratorBytes: boundedInteger(budgetsRecord.acceleratorBytes, 'residency.budgets.acceleratorBytes', 0, Number.MAX_SAFE_INTEGER),
    storageFreeBytes,
  });
  if (!Array.isArray(record.roots) || record.roots.length > 32) fail('hsme_residency_roots_invalid', 'residency.roots must contain at most 32 entries');
  const roots = record.roots.map((value, index) => normalizeResidencyRoot(value, index));
  const identities = roots.map(identity);
  if (new Set(identities).size !== identities.length) fail('hsme_residency_root_duplicate', 'residency.roots contains a duplicate identity');
  return deepFreeze({ schemaVersion: 1, descriptorDigest, fleetRevision, budgets, roots: Object.freeze(roots.sort((a, b) => identity(a).localeCompare(identity(b)))) });
}

export function serializeHsmePreparationPlanV1(plan: HsmePreparationPlanV1): string {
  return JSON.stringify(plan);
}

export async function hsmePreparationPlanV1Digest(plan: HsmePreparationPlanV1, hash: HashPort): Promise<string> {
  const bytes = new TextEncoder().encode(`${HSME_PREPARATION_V1_DIGEST_DOMAIN}${serializeHsmePreparationPlanV1(plan)}`);
  const digest = await hash.sha256(bytes);
  if (!/^[0-9a-f]{64}$/.test(digest)) fail('hsme_preparation_hash_port_invalid', 'HashPort must return lowercase SHA-256 hex');
  return digest;
}

export async function normalizeHsmePreparationEvidenceV1(
  raw: unknown,
  plan: HsmePreparationPlanV1,
  hash: HashPort,
): Promise<HsmePreparationEvidenceV1> {
  const record = exactRecord(raw, ['schemaVersion', 'descriptorDigest', 'fleetRevision', 'planDigest', 'measured'], ['schemaVersion', 'descriptorDigest', 'fleetRevision', 'planDigest', 'measured'], 'evidence');
  if (record.schemaVersion !== HSME_PREPARATION_EVIDENCE_V1_SCHEMA) fail('hsme_preparation_evidence_schema_unsupported', `evidence.schemaVersion must be ${HSME_PREPARATION_EVIDENCE_V1_SCHEMA}`);
  const descriptorDigest = sha256Value(record.descriptorDigest, 'evidence.descriptorDigest');
  const planDigest = sha256Value(record.planDigest, 'evidence.planDigest');
  if (descriptorDigest !== plan.descriptorDigest || record.fleetRevision !== plan.fleetRevision) {
    fail('hsme_preparation_evidence_binding_mismatch', 'evidence does not match descriptor/fleet revision');
  }
  if (planDigest !== await hsmePreparationPlanV1Digest(plan, hash)) fail('hsme_preparation_evidence_binding_mismatch', 'evidence planDigest does not match plan');
  const measuredRecord = exactRecord(record.measured, ['networkAcquisitionBytes', 'flashToRamBytes', 'ramToAcceleratorBytes', 'prefetchBytes', 'networkBytesDuringExecution'], ['networkAcquisitionBytes', 'flashToRamBytes', 'ramToAcceleratorBytes', 'prefetchBytes', 'networkBytesDuringExecution'], 'evidence.measured');
  const measured = {
    networkAcquisitionBytes: boundedInteger(measuredRecord.networkAcquisitionBytes, 'evidence.measured.networkAcquisitionBytes', 0, plan.totals.networkAcquisitionBytes),
    flashToRamBytes: boundedInteger(measuredRecord.flashToRamBytes, 'evidence.measured.flashToRamBytes', 0, plan.totals.flashToRamBytes),
    ramToAcceleratorBytes: boundedInteger(measuredRecord.ramToAcceleratorBytes, 'evidence.measured.ramToAcceleratorBytes', 0, plan.totals.ramToAcceleratorBytes),
    prefetchBytes: boundedInteger(measuredRecord.prefetchBytes, 'evidence.measured.prefetchBytes', 0, plan.totals.prefetchBytes),
    networkBytesDuringExecution: boundedInteger(measuredRecord.networkBytesDuringExecution, 'evidence.measured.networkBytesDuringExecution', 0, 0) as 0,
  };
  return deepFreeze({
    schemaVersion: HSME_PREPARATION_EVIDENCE_V1_SCHEMA,
    descriptorDigest,
    fleetRevision: plan.fleetRevision,
    planDigest,
    measured: Object.freeze(measured),
  });
}

function validateReadinessBinding(
  descriptor: HsmePackDescriptorV1,
  descriptorDigest: string,
  readiness: HsmePackReadinessEvidenceV1,
  residency: HsmeResidencySnapshotV1,
): void {
  if (!readiness || readiness.schemaVersion !== 1 || readiness.descriptorId !== `${descriptor.packId}@${descriptor.packVersion}`) {
    fail('hsme_preparation_readiness_mismatch', 'readiness does not match descriptor identity');
  }
  if (!PLAN_STATUSES.includes(readiness.status as HsmePreparationStatusV1)) {
    fail('hsme_preparation_readiness_mismatch', 'readiness status is unsupported');
  }
  if (!Number.isSafeInteger(readiness.fleetRevision) || readiness.fleetRevision < 0 || readiness.fleetRevision !== residency.fleetRevision) {
    fail('hsme_preparation_readiness_mismatch', 'readiness fleetRevision does not match residency');
  }
  if (residency.descriptorDigest !== descriptorDigest) fail('hsme_preparation_residency_binding_mismatch', 'residency descriptorDigest does not match descriptor');
  if (!Array.isArray(readiness.roots) || readiness.roots.length !== descriptor.roots.length) {
    fail('hsme_preparation_readiness_mismatch', 'readiness roots do not match descriptor roots');
  }
  const expected = new Map(descriptor.roots.map(root => [identity(root), root] as const));
  const seen = new Set<string>();
  for (const root of readiness.roots) {
    if (!root || typeof root.identity !== 'string' || seen.has(root.identity)) fail('hsme_preparation_readiness_mismatch', 'readiness contains duplicate or invalid root identity');
    seen.add(root.identity);
    const descriptorRoot = expected.get(root.identity);
    if (!descriptorRoot || root.sha256 !== descriptorRoot.sha256 || root.role !== descriptorRoot.role || root.expertId !== descriptorRoot.expertId) {
      fail('hsme_preparation_readiness_mismatch', `readiness root does not match descriptor: ${root.identity}`);
    }
  }
}

function validateResidencyBinding(
  descriptor: HsmePackDescriptorV1,
  residency: HsmeResidencySnapshotV1,
  device: DeviceCapabilityProfile,
): void {
  const expected = new Map(descriptor.roots.map(root => [identity(root), root] as const));
  for (const root of residency.roots) {
    const descriptorRoot = expected.get(identity(root));
    if (!descriptorRoot || descriptorRoot.sha256 !== root.sha256) fail('hsme_preparation_residency_binding_mismatch', `residency root is not in descriptor: ${identity(root)}`);
  }
  if (device.ramMb !== 'UNKNOWN') {
    const physicalRamBytes = safeMultiply(device.ramMb, 1024 * 1024, 'device RAM');
    if (residency.budgets.ramBytes > physicalRamBytes) fail('hsme_preparation_residency_budget_invalid', 'runtime RAM budget cannot exceed device RAM');
  }
  if (device.vramMb !== 'UNKNOWN') {
    const physicalAcceleratorBytes = safeMultiply(device.vramMb, 1024 * 1024, 'device accelerator memory');
    if (residency.budgets.acceleratorBytes > physicalAcceleratorBytes) fail('hsme_preparation_residency_budget_invalid', 'runtime accelerator budget cannot exceed known device VRAM');
  }
  if (device.storageFreeBytes !== 'UNKNOWN' && residency.budgets.storageFreeBytes !== 'UNKNOWN'
      && residency.budgets.storageFreeBytes > device.storageFreeBytes) {
    fail('hsme_preparation_residency_budget_invalid', 'runtime storage budget cannot exceed device free storage');
  }
}

function resolveManifest(root: HsmePackRootV1, manifests: HsmeCanonicalManifestResolverV1): ModelManifest {
  const manifest = manifests.resolve(root.modelId, root.version);
  if (!manifest) fail('hsme_preparation_manifest_missing', `canonical manifest is missing for ${identity(root)}`);
  if (manifest.modelId !== root.modelId || manifest.version !== root.version || manifest.sha256 !== root.sha256) {
    fail('hsme_preparation_manifest_mismatch', `canonical manifest identity does not match ${identity(root)}`);
  }
  if (!Number.isSafeInteger(manifest.sizeBytes) || manifest.sizeBytes <= 0) fail('hsme_preparation_manifest_invalid', `canonical manifest size is invalid for ${identity(root)}`);
  if (!SAFE_MANIFEST_STATUSES.has(manifest.status)) fail('hsme_preparation_manifest_status_blocked', `canonical manifest status cannot be prepared: ${manifest.status}`);
  return manifest;
}

function manifestCompatible(
  manifest: ModelManifest,
  device: DeviceCapabilityProfile,
  runtimes: RuntimeCapabilities,
): Readonly<{ ok: true } | { ok: false; reason: string }> {
  if (device.platform === 'UNKNOWN') return { ok: false, reason: 'DEVICE_PLATFORM_UNKNOWN' };
  if (!manifest.supportedPlatforms.includes(device.platform)) return { ok: false, reason: 'MANIFEST_PLATFORM_UNSUPPORTED' };
  if (!manifest.supportedAccelerators.includes(manifest.runtime)) return { ok: false, reason: 'MANIFEST_RUNTIME_BINDING_INVALID' };
  if (runtimes[manifest.runtime] !== true) return { ok: false, reason: 'RUNTIME_UNAVAILABLE' };
  if (!deviceRuntimeAvailable(manifest.runtime, device)) return { ok: false, reason: 'DEVICE_RUNTIME_UNAVAILABLE' };
  return { ok: true };
}

function deviceRuntimeAvailable(runtime: RuntimeKind, device: DeviceCapabilityProfile): boolean {
  switch (runtime) {
    case 'ONNX_RUNTIME': return true;
    case 'WASM': return device.wasm === true;
    case 'WEBGPU': return device.webgpu === true;
    case 'NNAPI': return device.nnapi === true;
    case 'DIRECTML': return device.directml === true;
    case 'CUDA': return device.cuda === true;
    case 'METAL': return device.metal === true;
    case 'VULKAN': return device.vulkan === true;
  }
}

function placementFor(runtime: RuntimeKind): Exclude<HsmePlacementV1, 'FLASH_ONLY' | 'DEFERRED'> {
  switch (runtime) {
    case 'NNAPI': return 'NPU';
    case 'WEBGPU':
    case 'DIRECTML':
    case 'CUDA':
    case 'METAL':
    case 'VULKAN': return 'GPU';
    case 'ONNX_RUNTIME':
    case 'WASM': return 'CPU';
  }
}

function sumTotals(
  roots: readonly HsmePreparationRootPlanV1[],
  residentModelBytes: number,
  cpuResidentBytes: number,
  acceleratorResidentBytes: number,
  largestAcceleratorStagingBytes: number,
): HsmePreparationPlanV1['totals'] {
  let networkAcquisitionBytes = 0;
  let storageReservationBytes = 0;
  let flashToRamBytes = 0;
  let ramToAcceleratorBytes = 0;
  for (const root of roots) {
    networkAcquisitionBytes = safeAdd(networkAcquisitionBytes, root.networkAcquisitionBytes, 'network acquisition bytes');
    storageReservationBytes = safeAdd(storageReservationBytes, root.storageReservationBytes, 'storage reservation bytes');
    flashToRamBytes = safeAdd(flashToRamBytes, root.flashToRamBytes, 'flash-to-RAM bytes');
    ramToAcceleratorBytes = safeAdd(ramToAcceleratorBytes, root.ramToAcceleratorBytes, 'RAM-to-accelerator bytes');
  }
  return Object.freeze({
    networkAcquisitionBytes,
    storageReservationBytes,
    residentModelBytes,
    ramWorkingBytes: safeAdd(cpuResidentBytes, largestAcceleratorStagingBytes, 'RAM working bytes'),
    acceleratorResidentBytes,
    flashToRamBytes,
    ramToAcceleratorBytes,
    prefetchBytes: 0,
    networkBytesDuringExecution: 0,
  });
}

function normalizeResidencyRoot(raw: unknown, index: number): HsmeResidencyRootStateV1 {
  const record = exactRecord(raw, ['modelId', 'version', 'sha256', 'ramResidentBytes', 'acceleratorResidentBytes'], ['modelId', 'version', 'sha256', 'ramResidentBytes', 'acceleratorResidentBytes'], `residency.roots[${index}]`);
  return Object.freeze({
    modelId: boundedIdentifier(record.modelId, `residency.roots[${index}].modelId`, 120),
    version: boundedIdentifier(record.version, `residency.roots[${index}].version`, 80),
    sha256: sha256Value(record.sha256, `residency.roots[${index}].sha256`),
    ramResidentBytes: boundedInteger(record.ramResidentBytes, `residency.roots[${index}].ramResidentBytes`, 0, Number.MAX_SAFE_INTEGER),
    acceleratorResidentBytes: boundedInteger(record.acceleratorResidentBytes, `residency.roots[${index}].acceleratorResidentBytes`, 0, Number.MAX_SAFE_INTEGER),
  });
}

function freezeRootPlan(root: HsmePreparationRootPlanV1): HsmePreparationRootPlanV1 {
  return Object.freeze(root);
}

function identity(root: Readonly<{ modelId: string; version: string }>): string {
  return `${root.modelId}@${root.version}`;
}

function exactRecord(raw: unknown, allowed: readonly string[], required: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('hsme_preparation_exact_schema_violation', `${path} must be an object`);
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) fail('hsme_preparation_exact_schema_violation', `${path} must be a plain object`);
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(record, key))) {
    fail('hsme_preparation_exact_schema_violation', `${path} contains unknown or missing fields`);
  }
  return record;
}

function boundedIdentifier(raw: unknown, path: string, maxLength: number): string {
  if (typeof raw !== 'string') fail('hsme_preparation_value_invalid', `${path} must be a string`);
  const value = raw.trim();
  if (!value || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) fail('hsme_preparation_value_invalid', `${path} is invalid`);
  return value;
}

function sha256Value(raw: unknown, path: string): string {
  if (typeof raw !== 'string' || !/^[0-9a-f]{64}$/.test(raw)) fail('hsme_preparation_value_invalid', `${path} must be lowercase SHA-256 hex`);
  return raw;
}

function boundedInteger(raw: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(raw) || (raw as number) < min || (raw as number) > max) fail('hsme_preparation_value_invalid', `${path} must be a safe integer in [${min}, ${max}]`);
  return raw as number;
}

function safeAdd(left: number, right: number, path: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail('hsme_preparation_value_invalid', `${path} exceeds safe integer range`);
  return result;
}

function safeMultiply(left: number, right: number, path: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) fail('hsme_preparation_value_invalid', `${path} exceeds safe integer range`);
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never {
  throw new HsmePreparationV1Error(code, message);
}
