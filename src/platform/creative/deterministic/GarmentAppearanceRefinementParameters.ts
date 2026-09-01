import {
  GARMENT_APPEARANCE_REFINEMENT_ALPHA_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_DILATION_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX,
  GARMENT_APPEARANCE_REFINEMENT_MASK_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_OUTSIDE_SUPPORT_POLICY,
  GARMENT_APPEARANCE_REFINEMENT_PRODUCER_SCHEMA,
  GARMENT_APPEARANCE_REFINEMENT_PROFILE,
  GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SOURCE,
} from './GarmentAppearanceRefinementIdentity.js';

export type GarmentAppearanceRefinementProducerParametersV1 = Readonly<{
  schema: typeof GARMENT_APPEARANCE_REFINEMENT_PRODUCER_SCHEMA;
  profile: typeof GARMENT_APPEARANCE_REFINEMENT_PROFILE;
  support: Readonly<{
    supportSource: typeof GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SOURCE;
    dilationPolicy: typeof GARMENT_APPEARANCE_REFINEMENT_DILATION_POLICY;
    dilationRadiusPx: typeof GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX;
    maskPolicy: typeof GARMENT_APPEARANCE_REFINEMENT_MASK_POLICY;
    outsideSupportPolicy: typeof GARMENT_APPEARANCE_REFINEMENT_OUTSIDE_SUPPORT_POLICY;
    alphaPolicy: typeof GARMENT_APPEARANCE_REFINEMENT_ALPHA_POLICY;
  }>;
}>;

export type NormalizedGarmentAppearanceRefinementProducerParameters = Readonly<{
  document: GarmentAppearanceRefinementProducerParametersV1;
  canonicalJson: string;
}>;

const TOP_LEVEL_KEYS = Object.freeze(['profile', 'schema', 'support']);
const SUPPORT_KEYS = Object.freeze([
  'alphaPolicy',
  'dilationPolicy',
  'dilationRadiusPx',
  'maskPolicy',
  'outsideSupportPolicy',
  'supportSource',
]);

export function normalizeGarmentAppearanceRefinementProducerParameters(
  value: unknown,
): NormalizedGarmentAppearanceRefinementProducerParameters {
  const root = requireRecord(value, 'Garment appearance refinement producer parameters');
  assertExactKeys(root, TOP_LEVEL_KEYS, 'Garment appearance refinement producer parameters');
  if (root.schema !== GARMENT_APPEARANCE_REFINEMENT_PRODUCER_SCHEMA) {
    throw new Error(`Garment appearance refinement schema must be ${GARMENT_APPEARANCE_REFINEMENT_PRODUCER_SCHEMA}`);
  }
  if (root.profile !== GARMENT_APPEARANCE_REFINEMENT_PROFILE) {
    throw new Error(`Garment appearance refinement profile must be ${GARMENT_APPEARANCE_REFINEMENT_PROFILE}`);
  }

  const support = requireRecord(root.support, 'Garment appearance refinement support parameters');
  assertExactKeys(support, SUPPORT_KEYS, 'Garment appearance refinement support parameters');
  if (support.supportSource !== GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SOURCE) {
    throw new Error(`Garment appearance refinement supportSource must be ${GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SOURCE}`);
  }
  if (support.dilationPolicy !== GARMENT_APPEARANCE_REFINEMENT_DILATION_POLICY) {
    throw new Error(`Garment appearance refinement dilationPolicy must be ${GARMENT_APPEARANCE_REFINEMENT_DILATION_POLICY}`);
  }
  if (support.dilationRadiusPx !== GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX) {
    throw new Error(`Garment appearance refinement dilationRadiusPx must be ${GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX}`);
  }
  if (support.maskPolicy !== GARMENT_APPEARANCE_REFINEMENT_MASK_POLICY) {
    throw new Error(`Garment appearance refinement maskPolicy must be ${GARMENT_APPEARANCE_REFINEMENT_MASK_POLICY}`);
  }
  if (support.outsideSupportPolicy !== GARMENT_APPEARANCE_REFINEMENT_OUTSIDE_SUPPORT_POLICY) {
    throw new Error(`Garment appearance refinement outsideSupportPolicy must be ${GARMENT_APPEARANCE_REFINEMENT_OUTSIDE_SUPPORT_POLICY}`);
  }
  if (support.alphaPolicy !== GARMENT_APPEARANCE_REFINEMENT_ALPHA_POLICY) {
    throw new Error(`Garment appearance refinement alphaPolicy must be ${GARMENT_APPEARANCE_REFINEMENT_ALPHA_POLICY}`);
  }

  const document = Object.freeze({
    schema: GARMENT_APPEARANCE_REFINEMENT_PRODUCER_SCHEMA,
    profile: GARMENT_APPEARANCE_REFINEMENT_PROFILE,
    support: Object.freeze({
      supportSource: GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SOURCE,
      dilationPolicy: GARMENT_APPEARANCE_REFINEMENT_DILATION_POLICY,
      dilationRadiusPx: GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX,
      maskPolicy: GARMENT_APPEARANCE_REFINEMENT_MASK_POLICY,
      outsideSupportPolicy: GARMENT_APPEARANCE_REFINEMENT_OUTSIDE_SUPPORT_POLICY,
      alphaPolicy: GARMENT_APPEARANCE_REFINEMENT_ALPHA_POLICY,
    }),
  } satisfies GarmentAppearanceRefinementProducerParametersV1);

  return Object.freeze({ document, canonicalJson: JSON.stringify(document) });
}

export const GARMENT_APPEARANCE_REFINEMENT_PRODUCER_PARAMETERS_V1 =
  normalizeGarmentAppearanceRefinementProducerParameters({
    schema: GARMENT_APPEARANCE_REFINEMENT_PRODUCER_SCHEMA,
    profile: GARMENT_APPEARANCE_REFINEMENT_PROFILE,
    support: {
      supportSource: GARMENT_APPEARANCE_REFINEMENT_SUPPORT_SOURCE,
      dilationPolicy: GARMENT_APPEARANCE_REFINEMENT_DILATION_POLICY,
      dilationRadiusPx: GARMENT_APPEARANCE_REFINEMENT_DILATION_RADIUS_PX,
      maskPolicy: GARMENT_APPEARANCE_REFINEMENT_MASK_POLICY,
      outsideSupportPolicy: GARMENT_APPEARANCE_REFINEMENT_OUTSIDE_SUPPORT_POLICY,
      alphaPolicy: GARMENT_APPEARANCE_REFINEMENT_ALPHA_POLICY,
    },
  });

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unknown or missing fields`);
  }
}
