import { immutable } from './immutable';
import type { VisualAnalysisInput, VisualEncoderTarget, VisualEncodingPolicy, VisualFeatures, VisualGoal } from './types';

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const normalized = (values: readonly number[] = []) => immutable(values.slice(0, 12).map(clamp));
const terms = (values: readonly string[] = []) => immutable([...new Set(values.map(value => value.trim().toLowerCase()).filter(Boolean))].sort());
const styleSimilarity = (actual: readonly string[], goal?: VisualGoal) => {
  const desired = terms(goal?.styles ?? goal?.direction.split(/[^\p{L}\p{N}]+/u));
  if (!desired.length) return .5;
  const present = new Set(terms(actual));
  return clamp(desired.filter(item => present.has(item)).length / desired.length);
};

export interface VisualFeatureEncoder { readonly target: VisualEncoderTarget; encode(input: VisualAnalysisInput, goal?: VisualGoal, policy?: VisualEncodingPolicy): VisualFeatures }

abstract class StructuredVisualEncoder implements VisualFeatureEncoder {
  abstract readonly target: VisualEncoderTarget;
  encode(input: VisualAnalysisInput, goal?: VisualGoal, policy: VisualEncodingPolicy = { privacyMode: 'NORMAL', cloudAnalysisAllowed: true, outboundImageAllowed: true }): VisualFeatures {
    this.authorize(policy);
    if (!Number.isFinite(input.width) || !Number.isFinite(input.height) || input.width <= 0 || input.height <= 0) throw new Error('Visual analysis requires positive finite dimensions');
    const width = Math.round(input.width), height = Math.round(input.height);
    return immutable({ schemaVersion: 'visual-features-v1', encoderTarget: this.target, composition: { balance: clamp(input.composition?.balance ?? .5), focus: clamp(input.composition?.focus ?? .5), negativeSpace: clamp(input.composition?.negativeSpace ?? .5) }, subjectCount: Math.max(0, Math.round(input.subjectCount ?? 0)), facePresence: clamp(input.facePresence ?? 0), objectClasses: terms(input.objectClasses), lighting: { exposure: clamp(input.lighting?.exposure ?? .5), contrast: clamp(input.lighting?.contrast ?? .5), uniformity: clamp(input.lighting?.uniformity ?? .5) }, colorDistribution: normalized(input.colorDistribution), backgroundComplexity: clamp(input.backgroundComplexity ?? .5), estimatedQuality: clamp(input.estimatedQuality ?? .5), resolution: { width, height, megapixels: Number((width * height / 1_000_000).toFixed(4)) }, depthCues: clamp(input.depthCues ?? .5), segmentationComplexity: clamp(input.segmentationComplexity ?? .5), visualStyle: terms(input.visualStyle), requestedStyleSimilarity: styleSimilarity(input.visualStyle ?? [], goal) });
  }
  protected authorize(_policy: VisualEncodingPolicy) {}
}

export class LocalVisualEncoder extends StructuredVisualEncoder { readonly target = 'LOCAL' as const; }
export class CloudVisualEncoder extends StructuredVisualEncoder {
  readonly target = 'CLOUD' as const;
  protected authorize(policy: VisualEncodingPolicy) {
    if (['LOCAL_ONLY', 'OFFLINE_ONLY'].includes(policy.privacyMode) || !policy.cloudAnalysisAllowed || !policy.outboundImageAllowed) throw new Error('Cloud visual encoding forbidden by privacy policy');
  }
}

export class PrivacyAwareVisualEncoder {
  constructor(private readonly local = new LocalVisualEncoder(), private readonly cloud = new CloudVisualEncoder()) {}
  encode(input: VisualAnalysisInput, goal: VisualGoal | undefined, policy: VisualEncodingPolicy, preferred: VisualEncoderTarget = 'LOCAL') { return (preferred === 'CLOUD' ? this.cloud : this.local).encode(input, goal, policy); }
  /** Only the structured representation is safe to forward; source image identifiers are never included. */
  transferable(features: VisualFeatures) { return immutable({ ...features, encoderTarget: features.encoderTarget }); }
}
