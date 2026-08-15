import { clamp, immutable, round, stableHash } from './immutable';
import { VISUAL_FEATURE_SCHEMA_VERSION } from './visual-types';
import type { CloudVisualFeatureRequest, LightingClass, LocalImageInput, VisualFeatureEncoder, VisualObservations, VisualRepresentation, VisualStyle } from './visual-types';

const LOCAL_ENCODER_VERSION = 'local-visual-encoder-v1';
const CLOUD_ENCODER_VERSION = 'cloud-visual-encoder-v1';
const COLOR_BINS = 12;

const normalizedObservations = (input: LocalImageInput): VisualObservations => {
  const pixels = input.rgba;
  let luminance = 0.5;
  let contrast = 0;
  const colors = Array(COLOR_BINS).fill(0) as number[];
  if (pixels?.length) {
    const stride = Math.max(4, Math.floor(pixels.length / 4096 / 4) * 4);
    let count = 0;
    let squared = 0;
    for (let index = 0; index + 2 < pixels.length; index += stride) {
      const value = (pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722) / 255;
      luminance += value; squared += value * value; count++;
      colors[Math.min(COLOR_BINS - 1, Math.floor(value * COLOR_BINS))]++;
    }
    luminance /= count + 1;
    contrast = Math.sqrt(Math.max(0, squared / Math.max(1, count) - luminance * luminance));
    for (let index = 0; index < colors.length; index++) colors[index] = round(colors[index] / Math.max(1, count));
  }
  const observations = input.observations ?? {};
  const distribution = [...(observations.colorDistribution ?? colors)].slice(0, COLOR_BINS);
  while (distribution.length < COLOR_BINS) distribution.push(0);
  const lighting: LightingClass = observations.lighting ?? (contrast > 0.28 ? 'HIGH_CONTRAST' : luminance < 0.3 ? 'DARK' : luminance > 0.75 ? 'BRIGHT' : 'BALANCED');
  return immutable({
    composition: clamp(observations.composition ?? 0.5), subjectCount: Math.max(0, Math.round(observations.subjectCount ?? 0)),
    facePresence: clamp(observations.facePresence ?? 0), objectClasses: immutable([...(observations.objectClasses ?? [])].slice(0, 16).sort()),
    lighting, colorDistribution: immutable(distribution.map((value) => clamp(value))),
    backgroundComplexity: clamp(observations.backgroundComplexity ?? contrast * 2), estimatedQuality: clamp(observations.estimatedQuality ?? Math.min(1, Math.sqrt(input.width * input.height) / 2500)),
    depthCues: clamp(observations.depthCues ?? 0.5), segmentationComplexity: clamp(observations.segmentationComplexity ?? 0.5),
    visualStyle: observations.visualStyle ?? 'UNKNOWN', requestedStyleSimilarity: clamp(observations.requestedStyleSimilarity ?? 0.5),
  });
};

const vectorize = (observations: VisualObservations, width: number, height: number): readonly number[] => immutable([
  clamp(observations.composition), clamp(observations.subjectCount / 20), clamp(observations.facePresence),
  stableHash(observations.objectClasses.join('|')), stableHash(observations.lighting), ...observations.colorDistribution,
  clamp(observations.backgroundComplexity), clamp(observations.estimatedQuality), clamp(width / 12_000), clamp(height / 12_000),
  clamp((width * height) / 80_000_000), clamp(observations.depthCues), clamp(observations.segmentationComplexity),
  stableHash(observations.visualStyle), clamp(observations.requestedStyleSimilarity),
].map(round));

const privacy = immutable({ rawImageRetained: false as const, rawImageTransmitted: false as const, featureOnly: true as const });

export class LocalVisualEncoder implements VisualFeatureEncoder<LocalImageInput> {
  readonly version = LOCAL_ENCODER_VERSION;
  encode(input: LocalImageInput): VisualRepresentation {
    if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width <= 0 || input.height <= 0) throw new Error('Valid image dimensions are required');
    if (input.rgba && input.rgba.length !== input.width * input.height * 4) throw new Error('RGBA buffer length does not match dimensions');
    const observations = normalizedObservations(input);
    return immutable({ schemaVersion: VISUAL_FEATURE_SCHEMA_VERSION, encoderVersion: this.version, source: 'LOCAL' as const,
      width: input.width, height: input.height, values: vectorize(observations, input.width, input.height), observations, privacy });
  }
}

export class CloudVisualEncoder implements VisualFeatureEncoder<CloudVisualFeatureRequest> {
  readonly version = CLOUD_ENCODER_VERSION;
  encode(request: CloudVisualFeatureRequest): VisualRepresentation {
    const local = request.localRepresentation;
    if (local.source !== 'LOCAL' || !local.privacy.featureOnly || local.privacy.rawImageTransmitted) throw new Error('Cloud encoder accepts local feature-only representations');
    const vocabulary = new Set(request.allowedObjectVocabulary ?? local.observations.objectClasses);
    const requestedStyle = request.requestedStyle?.trim().toUpperCase().replaceAll(' ', '_') as VisualStyle | undefined;
    const observations = immutable({ ...local.observations,
      objectClasses: immutable(local.observations.objectClasses.filter((value) => vocabulary.has(value))),
      requestedStyleSimilarity: requestedStyle ? round(1 - Math.abs(stableHash(requestedStyle) - stableHash(local.observations.visualStyle))) : local.observations.requestedStyleSimilarity,
    });
    return immutable({ schemaVersion: VISUAL_FEATURE_SCHEMA_VERSION, encoderVersion: this.version, source: 'CLOUD' as const,
      width: local.width, height: local.height, values: vectorize(observations, local.width, local.height), observations, privacy });
  }
}
