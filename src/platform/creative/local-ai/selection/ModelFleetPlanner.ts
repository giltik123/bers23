import { immutableClone } from '../immutable';
import type { ModelPromotionDecision } from './ModelFleetPromotionPolicy';
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

type Candidate = Readonly<{ model: ModelManifest; coverage: readonly string[]; latencyMs: number }>;
type FleetPlan = Readonly<{ mask: bigint; selected: readonly Candidate[]; bytes: number; quality: number; stability: number; latency: number }>;

export function modelFleetKey(model: Pick<ModelManifest, 'modelId' | 'version'>): string { return `${model.modelId}@${model.version}`; }

export class ModelFleetPlanner {
  recommend(input: Readonly<{
    snapshot: DeviceCapabilitySnapshot;
    catalog: readonly ModelManifest[];
    trustedModelKeys: readonly string[];
    storageFreeBytes?: number | 'UNKNOWN';
    policy?: ModelFleetRecommendationPolicy;
    promotionDecisions?: Readonly<Record<string, ModelPromotionDecision>>;
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
    const candidates: Candidate[] = [];
    let resourceStorageBlocked = false;

    for (const model of [...input.catalog].sort(compareIdentity)) {
      const reasons: ModelFleetExclusionReason[] = [];
      const rawCapabilities = uniqueSorted(model.capabilities.map(normalizeCapability));
      const capabilities = uniqueSorted(model.capabilities.map(canonicalCapability));
      const coverage = capabilities.filter((capability) => requestedCapabilities.includes(capability));
      const modelKey = modelFleetKey(model);
      const promotion = input.promotionDecisions?.[modelKey];
      if (!trusted.has(modelKey)) reasons.push('UNTRUSTED_MANIFEST');
      if (input.promotionDecisions) {
        if (!promotion || promotion.status === 'BENCHMARK_REQUIRED') reasons.push('BENCHMARK_REQUIRED');
        else if (promotion.status === 'STALE') reasons.push('BENCHMARK_STALE');
        else if (promotion.status === 'REJECTED') reasons.push('BENCHMARK_REJECTED');
      }
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
      else candidates.push(Object.freeze({
        model,
        coverage: Object.freeze(coverage),
        latencyMs: promotedMeasuredLatency(promotion, model.estimatedLatency),
      }));
    }

    const plan = optimizeFleet(candidates, requestedCapabilities, budgetBytes);
    const selected = plan.selected.map((candidate) => candidate.model);
    const selectedKeys = new Set(selected.map(modelFleetKey));
    const selectedModelIds = new Set(selected.map((model) => model.modelId));
    const covered = new Set(plan.selected.flatMap((candidate) => candidate.coverage));
    const uncoveredCapabilities = requestedCapabilities.filter((capability) => !covered.has(capability));

    for (const candidate of candidates) {
      if (selectedKeys.has(modelFleetKey(candidate.model))) continue;
      if (selectedModelIds.has(candidate.model.modelId)) exclusions.push(exclusion(candidate.model, ['MODEL_VERSION_ALREADY_SELECTED']));
      else if (candidate.coverage.every((capability) => covered.has(capability))) exclusions.push(exclusion(candidate.model, ['CAPABILITY_ALREADY_COVERED']));
      else exclusions.push(exclusion(candidate.model, ['BUDGET_EXCEEDED']));
    }

    const status = selected.length > 0
      ? uncoveredCapabilities.length === 0 ? 'READY' : 'PARTIAL'
      : resourceStorageBlocked ? 'BLOCKED_STORAGE' : 'NO_COMPATIBLE_MODELS';
    return result(status, requestedCapabilities, selected, uncoveredCapabilities, exclusions, budgetBytes, freeBytes, reserveBytes, plan.bytes);
  }
}

/**
 * Exact dynamic programming over the small requested-capability mask. Catalog size may grow,
 * but state count is bounded by capability combinations rather than byte budget or model count.
 * Versions of one modelId are processed as mutually-exclusive alternatives.
 */
function optimizeFleet(candidates: readonly Candidate[], requestedCapabilities: readonly string[], budgetBytes: number): FleetPlan {
  const bitByCapability = new Map(requestedCapabilities.map((capability, index) => [capability, 1n << BigInt(index)]));
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.model.modelId) ?? [];
    group.push(candidate);
    groups.set(candidate.model.modelId, group);
  }
  for (const group of groups.values()) group.sort((a, b) => compareIdentity(a.model, b.model));

  let states = new Map<string, FleetPlan>([['0', emptyPlan()]]);
  for (const modelId of [...groups.keys()].sort()) {
    const options = groups.get(modelId)!;
    const next = new Map<string, FleetPlan>();
    for (const state of states.values()) {
      keepBestForMask(next, state);
      for (const candidate of options) {
        const bytes = state.bytes + candidate.model.sizeBytes;
        if (bytes > budgetBytes) continue;
        const candidateMask = coverageMask(candidate.coverage, bitByCapability);
        const proposal: FleetPlan = Object.freeze({
          mask: state.mask | candidateMask,
          selected: Object.freeze([...state.selected, candidate]),
          bytes,
          quality: state.quality + candidate.model.qualityScore,
          stability: state.stability + candidate.model.stabilityScore,
          latency: state.latency + candidate.latencyMs,
        });
        keepBestForMask(next, proposal);
      }
    }
    states = next;
  }
  return [...states.values()].sort(compareFinalPlans)[0] ?? emptyPlan();
}

function keepBestForMask(states: Map<string, FleetPlan>, proposal: FleetPlan): void {
  const key = proposal.mask.toString();
  const current = states.get(key);
  if (!current || compareSameCoveragePlans(proposal, current) < 0) states.set(key, proposal);
}

function compareFinalPlans(a: FleetPlan, b: FleetPlan): number {
  const coverageDifference = bitCount(b.mask) - bitCount(a.mask);
  if (coverageDifference !== 0) return coverageDifference;
  return compareSameCoveragePlans(a, b);
}

function compareSameCoveragePlans(a: FleetPlan, b: FleetPlan): number {
  if (a.bytes !== b.bytes) return a.bytes - b.bytes;
  if (a.selected.length !== b.selected.length) return a.selected.length - b.selected.length;
  if (a.quality !== b.quality) return b.quality - a.quality;
  if (a.stability !== b.stability) return b.stability - a.stability;
  if (a.latency !== b.latency) return a.latency - b.latency;
  return comparePlanIdentity(a, b);
}

function comparePlanIdentity(a: FleetPlan, b: FleetPlan): number {
  const left = [...a.selected].sort((x, y) => x.model.modelId.localeCompare(y.model.modelId) || compareVersionDesc(x.model.version, y.model.version));
  const right = [...b.selected].sort((x, y) => x.model.modelId.localeCompare(y.model.modelId) || compareVersionDesc(x.model.version, y.model.version));
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftItem = left[index]; const rightItem = right[index];
    if (!leftItem) return -1;
    if (!rightItem) return 1;
    const modelDifference = leftItem.model.modelId.localeCompare(rightItem.model.modelId);
    if (modelDifference !== 0) return modelDifference;
    const versionDifference = compareVersionDesc(leftItem.model.version, rightItem.model.version);
    if (versionDifference !== 0) return versionDifference;
  }
  return 0;
}

function emptyPlan(): FleetPlan { return Object.freeze({ mask: 0n, selected: Object.freeze([]), bytes: 0, quality: 0, stability: 0, latency: 0 }); }
function coverageMask(coverage: readonly string[], bitByCapability: ReadonlyMap<string, bigint>): bigint { return coverage.reduce((mask, capability) => mask | (bitByCapability.get(capability) ?? 0n), 0n); }
function bitCount(value: bigint): number { let count = 0; for (let current = value; current > 0n; current >>= 1n) count += Number(current & 1n); return count; }

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

function promotedMeasuredLatency(promotion: ModelPromotionDecision | undefined, fallback: number): number {
  const value = promotion?.status === 'PROMOTED' ? promotion.measuredLatencyMs : undefined;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function compareIdentity(a: ModelManifest, b: ModelManifest): number { return a.modelId.localeCompare(b.modelId) || compareVersionDesc(a.version, b.version); }
function compareVersionDesc(a: string, b: string): number {
  const matchA = /^(\d+)\.(\d+)\.(\d+)$/.exec(a); const matchB = /^(\d+)\.(\d+)\.(\d+)$/.exec(b);
  if (matchA && matchB) {
    for (let index = 1; index <= 3; index += 1) { const difference = Number(matchB[index]) - Number(matchA[index]); if (difference !== 0) return difference; }
    return 0;
  }
  if (matchA) return -1;
  if (matchB) return 1;
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
