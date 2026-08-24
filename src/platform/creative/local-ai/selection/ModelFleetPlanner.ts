import { immutableClone } from '../immutable';
import type {
  DeviceCapabilitySnapshot,
  ModelFleetExclusion,
  ModelFleetExclusionReason,
  ModelFleetRecommendation,
  ModelFleetRecommendationPolicy,
  ModelManifest,
} from '../types';

const MIB = 1024 * 1024;
const DEFAULT_BOOTSTRAP_CAPABILITIES = Object.freeze(['ANALYSIS', 'OCR', 'SEGMENTATION', 'UPSCALE']);
const SAFE_CATALOG_STATUSES = new Set(['AVAILABLE', 'INSTALLED', 'READY']);
const HEAVY_CAPABILITY_MARKERS = Object.freeze(['GENERAT', 'INPAINT', 'OUTPAINT', 'DIFFUSION', 'TEXT_TO_IMAGE', 'IMAGE_TO_IMAGE', 'LOCAL_REASONING', 'VISION_LANGUAGE']);

export function modelFleetKey(model: Pick<ModelManifest, 'modelId' | 'version'>): string { return `${model.modelId}@${model.version}`; }

export class ModelFleetPlanner {
  recommend(input: Readonly<{
    snapshot: DeviceCapabilitySnapshot;
    catalog: readonly ModelManifest[];
    trustedModelKeys: readonly string[];
    storageFreeBytes?: number | 'UNKNOWN';
    policy?: ModelFleetRecommendationPolicy;
  }>): ModelFleetRecommendation {
    const { snapshot } = input;
    const policy = normalizePolicy(input.policy);
    const requestedCapabilities = uniqueSorted(policy.bootstrapCapabilities.map(canonicalCapability));
    const profile = snapshot.profile;
    const trusted = new Set(input.trustedModelKeys);
    const exclusions: ModelFleetExclusion[] = [];

    if (profile.platform === 'UNKNOWN' || profile.deviceClass === 'UNKNOWN' || profile.tier === 'UNKNOWN') {
      return result('BLOCKED_INSUFFICIENT_EVIDENCE', requestedCapabilities, [], [], exclusions, 'UNKNOWN', 'UNKNOWN', 'UNKNOWN');
    }

    const runtimeValues = Object.values(snapshot.runtimeCapabilities);
    if (!runtimeValues.some((value) => value === true) && runtimeValues.every((value) => value === 'UNKNOWN')) {
      return result('BLOCKED_INSUFFICIENT_EVIDENCE', requestedCapabilities, [], [], exclusions, 'UNKNOWN', 'UNKNOWN', 'UNKNOWN');
    }

    const freeBytes = effectiveFreeBytes(input.storageFreeBytes, profile.storageFreeBytes);
    if (freeBytes === 'UNKNOWN') {
      return result('BLOCKED_INSUFFICIENT_EVIDENCE', requestedCapabilities, [], [], exclusions, 'UNKNOWN', 'UNKNOWN', 'UNKNOWN');
    }

    const defaults = defaultBudget(profile.deviceClass, profile.tier);
    const reserveBytes = policy.minFreeBytesAfterInstall ?? defaults.reserveBytes;
    const maxAutoInstallBytes = policy.maxAutoInstallBytes ?? defaults.maxAutoInstallBytes;
    const budgetBytes = Math.max(0, Math.min(maxAutoInstallBytes, freeBytes - reserveBytes));
    if (budgetBytes <= 0) {
      return result('BLOCKED_STORAGE', requestedCapabilities, [], [], exclusions, budgetBytes, freeBytes, reserveBytes);
    }

    const maxModelBytes = Math.min(policy.maxModelBytes ?? budgetBytes, budgetBytes);
    const ramMb = profile.ramMb;
    const vramMb = profile.vramMb;
    const candidates: Array<Readonly<{ model: ModelManifest; coverage: readonly string[] }>> = [];
    let resourceStorageBlocked = false;

    for (const model of [...input.catalog].sort(compareIdentity)) {
      const reasons: ModelFleetExclusionReason[] = [];
      const rawCapabilities = uniqueSorted(model.capabilities.map(normalizeCapability));
      const capabilities = uniqueSorted(model.capabilities.map(canonicalCapability));
      const coverage = capabilities.filter((capability) => requestedCapabilities.includes(capability));
      if (!trusted.has(modelFleetKey(model))) reasons.push('UNTRUSTED_MANIFEST');
      if (!model.supportedPlatforms.includes(profile.platform)) reasons.push('UNSUPPORTED_PLATFORM');
      if (snapshot.runtimeCapabilities[model.runtime] !== true || !model.supportedAccelerators.some((kind) => snapshot.runtimeCapabilities[kind] === true)) reasons.push('RUNTIME_UNAVAILABLE');
      if (!SAFE_CATALOG_STATUSES.has(model.status)) reasons.push('UNSAFE_STATUS');
      if (coverage.length === 0) reasons.push('CAPABILITY_NOT_BOOTSTRAP');
      if (rawCapabilities.some((capability) => HEAVY_CAPABILITY_MARKERS.some((marker) => capability.includes(marker)))) reasons.push('HEAVY_CAPABILITY');
      if (model.requiredRam > 0 && typeof ramMb !== 'number') reasons.push('UNKNOWN_RAM');
      else if (model.requiredRam > 0 && typeof ramMb === 'number' && ramMb < model.requiredRam) reasons.push('INSUFFICIENT_RAM');
      if (model.requiredVram > 0 && typeof vramMb !== 'number') reasons.push('UNKNOWN_VRAM');
      else if (model.requiredVram > 0 && typeof vramMb === 'number' && vramMb < model.requiredVram) reasons.push('INSUFFICIENT_VRAM');
      if (model.sizeBytes > freeBytes - reserveBytes) reasons.push('INSUFFICIENT_STORAGE');
      if (model.qualityScore < policy.minQualityScore) reasons.push('QUALITY_BELOW_POLICY');
      if (model.stabilityScore < policy.minStabilityScore) reasons.push('STABILITY_BELOW_POLICY');
      if (model.sizeBytes > maxModelBytes) reasons.push('MODEL_TOO_LARGE');
      if (reasons.includes('INSUFFICIENT_STORAGE') && reasons.every((reason) => reason === 'INSUFFICIENT_STORAGE' || reason === 'MODEL_TOO_LARGE')) resourceStorageBlocked = true;
      if (reasons.length) exclusions.push(exclusion(model, reasons));
      else candidates.push(Object.freeze({ model, coverage: Object.freeze(coverage) }));
    }

    candidates.sort(compareCandidate);
    const selected: ModelManifest[] = [];
    const selectedModelIds = new Set<string>();
    const covered = new Set<string>();
    let estimatedBytes = 0;
    let selectionBudgetBlocked = false;

    for (const candidate of candidates) {
      if (selectedModelIds.has(candidate.model.modelId)) {
        exclusions.push(exclusion(candidate.model, ['MODEL_VERSION_ALREADY_SELECTED']));
        continue;
      }
      const uncovered = candidate.coverage.filter((capability) => !covered.has(capability));
      if (uncovered.length === 0) {
        exclusions.push(exclusion(candidate.model, ['CAPABILITY_ALREADY_COVERED']));
        continue;
      }
      if (estimatedBytes + candidate.model.sizeBytes > budgetBytes) {
        exclusions.push(exclusion(candidate.model, ['BUDGET_EXCEEDED']));
        selectionBudgetBlocked = true;
        continue;
      }
      selected.push(candidate.model);
      selectedModelIds.add(candidate.model.modelId);
      estimatedBytes += candidate.model.sizeBytes;
      for (const capability of uncovered) covered.add(capability);
    }

    const uncoveredCapabilities = requestedCapabilities.filter((capability) => !covered.has(capability));
    const status = selected.length > 0 ? 'READY' : resourceStorageBlocked || selectionBudgetBlocked ? 'BLOCKED_STORAGE' : 'NO_COMPATIBLE_MODELS';
    return result(status, requestedCapabilities, selected, uncoveredCapabilities, exclusions, budgetBytes, freeBytes, reserveBytes, estimatedBytes);
  }
}

function result(
  status: ModelFleetRecommendation['status'],
  requestedCapabilities: readonly string[],
  selected: readonly ModelManifest[],
  uncoveredCapabilities: readonly string[],
  exclusions: readonly ModelFleetExclusion[],
  budgetBytes: number | 'UNKNOWN',
  freeBytes: number | 'UNKNOWN',
  reserveBytes: number | 'UNKNOWN',
  estimatedBytes = 0,
): ModelFleetRecommendation {
  return immutableClone({
    status,
    modelIds: selected.map((model) => model.modelId),
    modelBindings: selected.map((model) => ({ modelId: model.modelId, version: model.version })),
    estimatedBytes,
    budgetBytes,
    freeBytes,
    reserveBytes,
    requestedCapabilities,
    uncoveredCapabilities,
    exclusions: [...exclusions].sort((a, b) => a.modelId.localeCompare(b.modelId) || compareVersionDesc(a.version, b.version)),
  });
}

function exclusion(model: ModelManifest, reasons: readonly ModelFleetExclusionReason[]): ModelFleetExclusion {
  return Object.freeze({ modelId: model.modelId, version: model.version, reasons: Object.freeze(uniqueSorted(reasons)) });
}

function compareIdentity(a: ModelManifest, b: ModelManifest): number { return a.modelId.localeCompare(b.modelId) || compareVersionDesc(a.version, b.version); }
function compareCandidate(a: Readonly<{ model: ModelManifest; coverage: readonly string[] }>, b: Readonly<{ model: ModelManifest; coverage: readonly string[] }>): number {
  const efficiency = b.coverage.length * a.model.sizeBytes - a.coverage.length * b.model.sizeBytes;
  if (efficiency !== 0) return efficiency;
  if (a.model.qualityScore !== b.model.qualityScore) return b.model.qualityScore - a.model.qualityScore;
  if (a.model.stabilityScore !== b.model.stabilityScore) return b.model.stabilityScore - a.model.stabilityScore;
  if (a.model.estimatedLatency !== b.model.estimatedLatency) return a.model.estimatedLatency - b.model.estimatedLatency;
  if (a.model.sizeBytes !== b.model.sizeBytes) return a.model.sizeBytes - b.model.sizeBytes;
  return compareIdentity(a.model, b.model);
}

function compareVersionDesc(a: string, b: string): number {
  const av = a.split('.').map(Number); const bv = b.split('.').map(Number);
  for (let index = 0; index < Math.max(av.length, bv.length); index += 1) {
    const difference = (bv[index] ?? 0) - (av[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return b.localeCompare(a);
}

function effectiveFreeBytes(primary: number | 'UNKNOWN' | undefined, profileValue: number | 'UNKNOWN'): number | 'UNKNOWN' {
  const values = [primary, profileValue].filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  return values.length ? Math.min(...values) : 'UNKNOWN';
}

function defaultBudget(deviceClass: Exclude<DeviceCapabilitySnapshot['profile']['deviceClass'], 'UNKNOWN'>, tier: Exclude<DeviceCapabilitySnapshot['profile']['tier'], 'UNKNOWN'>): Readonly<{ maxAutoInstallBytes: number; reserveBytes: number }> {
  const caps = deviceClass === 'BROWSER'
    ? { LOW: 64, MEDIUM: 96, HIGH: 128, EXTREME: 192 }
    : deviceClass === 'MOBILE'
      ? { LOW: 64, MEDIUM: 160, HIGH: 256, EXTREME: 384 }
      : { LOW: 128, MEDIUM: 256, HIGH: 512, EXTREME: 768 };
  const reserve = deviceClass === 'DESKTOP' ? 256 : 96;
  return Object.freeze({ maxAutoInstallBytes: caps[tier] * MIB, reserveBytes: reserve * MIB });
}

function normalizePolicy(policy: ModelFleetRecommendationPolicy | undefined): Required<Pick<ModelFleetRecommendationPolicy, 'bootstrapCapabilities' | 'minQualityScore' | 'minStabilityScore'>> & Omit<ModelFleetRecommendationPolicy, 'bootstrapCapabilities' | 'minQualityScore' | 'minStabilityScore'> {
  const normalized = {
    bootstrapCapabilities: policy?.bootstrapCapabilities?.length ? [...policy.bootstrapCapabilities] : [...DEFAULT_BOOTSTRAP_CAPABILITIES],
    maxAutoInstallBytes: policy?.maxAutoInstallBytes,
    minFreeBytesAfterInstall: policy?.minFreeBytesAfterInstall,
    maxModelBytes: policy?.maxModelBytes,
    minQualityScore: policy?.minQualityScore ?? 0.6,
    minStabilityScore: policy?.minStabilityScore ?? 0.75,
  };
  for (const [field, value] of Object.entries(normalized)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) throw new Error(`Invalid model fleet policy ${field}`);
  }
  if (normalized.minQualityScore > 1 || normalized.minStabilityScore > 1) throw new Error('Model fleet score thresholds must be between 0 and 1');
  return normalized;
}

function canonicalCapability(value: string): string {
  const normalized = normalizeCapability(value);
  if (normalized === 'OCR' || normalized.includes('_OCR') || normalized.startsWith('OCR_')) return 'OCR';
  if (normalized.includes('SEGMENT')) return 'SEGMENTATION';
  if (normalized.includes('UPSCALE') || normalized.includes('SUPER_RESOLUTION')) return 'UPSCALE';
  if (normalized.includes('ANALYSIS')) return 'ANALYSIS';
  return normalized;
}
function normalizeCapability(value: string): string { return value.trim().replace(/[\s-]+/g, '_').toUpperCase(); }
function uniqueSorted<T extends string>(values: readonly T[]): T[] { return [...new Set(values)].sort() as T[]; }
