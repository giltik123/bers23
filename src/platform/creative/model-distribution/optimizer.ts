import { immutableClone } from '../local-ai/immutable';
import type { ModelManifest } from '../local-ai/types';
import { PROFILE_CAPABILITIES } from './profiles';
import type { BundleProfile, ModelBundle, ModelTelemetry, RecommendationContext, RejectedModel } from './types';

const norm = (value: number) => Math.max(0, Math.min(1, value));
const capabilityMatch = (model: ModelManifest, desired: readonly string[]) => model.capabilities.some((value) => desired.some((wanted) => value.toLowerCase().includes(wanted)));

export class BundleOptimizer {
  optimize(profile: BundleProfile, catalog: readonly ModelManifest[], context: RecommendationContext): Readonly<{ bundle: ModelBundle; rejected: readonly RejectedModel[] }> {
    const desired = PROFILE_CAPABILITIES[context.offline ? 'OFFLINE' : profile]; const budget = context.policy.storageBudget === 'UNLIMITED' ? Number.MAX_SAFE_INTEGER : context.policy.storageBudget;
    const scored = catalog.map((manifest) => this.score(manifest, desired, context)).sort((a, b) => b.score - a.score || a.manifest.modelId.localeCompare(b.manifest.modelId));
    const chosen: typeof scored = []; const rejected: RejectedModel[] = []; let bytes = 0;
    for (const item of scored) { if (item.reasons.length || !capabilityMatch(item.manifest, desired) || bytes + item.manifest.sizeBytes > budget) { rejected.push({ modelId: item.manifest.modelId, reasons: item.reasons.length ? item.reasons : [bytes + item.manifest.sizeBytes > budget ? 'Storage budget exceeded' : 'Capability not requested'] }); continue; } chosen.push(item); bytes += item.manifest.sizeBytes; }
    const models = chosen.map((item, index) => ({ manifest: item.manifest, priority: index + 1, score: item.score, reasons: item.positive, status: 'QUEUED' as const }));
    const telemetry = chosen.map(({ manifest }) => context.telemetry.find((value) => value.modelId === manifest.modelId));
    const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return immutableClone({ bundle: { bundleId: `${profile.toLowerCase()}-${context.device.platform.toLowerCase()}`, version: '1.0.0', profile, models, capabilities: [...new Set(models.flatMap(({ manifest }) => manifest.capabilities))].sort(), sizeBytes: bytes, requiredStorage: Math.ceil(bytes * 1.15), requiredRam: Math.max(0, ...models.map(({ manifest }) => manifest.requiredRam)), requiredVram: Math.max(0, ...models.map(({ manifest }) => manifest.requiredVram)), estimatedPerformance: avg(chosen.map(({ score }) => score)), estimatedEnergy: avg(models.map(({ manifest }) => manifest.energyScore)), expectedCloudSavings: avg(telemetry.map((value) => value?.cloudSavings ?? 0)), compatibility: avg(chosen.map(({ compatibility }) => compatibility)), priority: profile === 'MINIMAL' ? 1 : profile === 'BALANCED' ? 2 : 3 }, rejected });
  }
  private score(manifest: ModelManifest, desired: readonly string[], context: RecommendationContext) {
    const telemetry: ModelTelemetry | undefined = context.telemetry.find((value) => value.modelId === manifest.modelId); const { device, policy } = context;
    const ram = device.ramMb === 'UNKNOWN' ? 0 : device.ramMb; const vram = device.vramMb === 'UNKNOWN' ? 0 : device.vramMb; const storage = device.storageFreeBytes === 'UNKNOWN' ? 0 : device.storageFreeBytes;
    const compatible = manifest.supportedPlatforms.includes(device.platform) && manifest.requiredRam <= ram && manifest.requiredVram <= vram && manifest.sizeBytes * 1.15 <= storage; const compatibility = compatible ? 1 : 0; const w = policy.weights;
    const speed = norm(1 - (telemetry?.latencyMs ?? manifest.estimatedLatency) / 10_000); const quality = telemetry?.quality ?? manifest.qualityScore; const savings = telemetry?.cloudSavings ?? 0; const privacy = policy.privacyMode === 'NORMAL' ? .5 : 1; const memory = norm(manifest.requiredRam / Math.max(1, ram)); const thermal = telemetry?.thermalImpact ?? (1 - manifest.energyScore); const storageCost = norm(manifest.sizeBytes / Math.max(1, storage));
    const score = quality*w.quality + compatibility*w.compatibility + savings*w.cloudSavings + speed*w.speed + privacy*w.privacy - memory*w.memoryPressure - (1-manifest.energyScore)*w.energyCost - thermal*w.thermalRisk - storageCost*w.storageCost;
    return { manifest, score: Math.round(score * 1e6) / 1e6, compatibility, positive: [`quality ${quality.toFixed(2)}`, `speed ${speed.toFixed(2)}`, `cloud savings ${savings.toFixed(2)}`], reasons: compatible ? [] : ['Device, runtime resources, or free storage are incompatible'] };
  }
}
