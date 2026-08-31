import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
} from '../../../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import { normalizeGarmentTextureCompositeProducerParameters } from '../../../src/platform/creative/deterministic/GarmentTextureCompositeParameters.ts';

export const FASHION_TRYON_ORCHESTRATION_VERSION = '1';
export const FASHION_TRYON_MAX_CLIENT_REQUEST_ID_LENGTH = 179;
export const FASHION_TRYON_MAX_SOURCE_ARTIFACT_ID_LENGTH = 512;
export const FASHION_TRYON_WARP_PHASE_SUFFIX = ':garment-warp:v1';
export const FASHION_TRYON_TEXTURE_PHASE_SUFFIX = ':texture-composite:v1';
export const FASHION_TRYON_DEFAULT_FEATHER_RADIUS_V1 = 2;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_REQUEST_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const INPUT_KEYS = Object.freeze(['clientRequestId', 'garmentId', 'projectId', 'sourceArtifactId'] as const);

export type FashionTryOnOrchestrationIntentV1 = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  garmentId: string;
  clientRequestId: string;
}>;

export type FashionTryOnOrchestrationPhaseRequestIdsV1 = Readonly<{
  garmentWarp: string;
  textureComposite: string;
}>;

/**
 * Pure one-garment F4b.6 orchestration intent contract.
 *
 * Evidence identities are intentionally absent. Representation, body-anchor and
 * immutable warp-layer evidence must be resolved inside Core by later coordinator
 * layers. This helper owns no DB, HTTP, execution, provider or Project authority.
 */
export function normalizeFashionTryOnOrchestrationIntent(value: unknown): FashionTryOnOrchestrationIntentV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw contractError('fashion_tryon_orchestration_invalid_request', 'Fashion Try-On orchestration request must be an object');
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  if (actual.length !== INPUT_KEYS.length || INPUT_KEYS.some((key, index) => actual[index] !== key)) {
    throw contractError('forbidden_client_authority', 'Fashion Try-On orchestration accepts stable user intent fields only');
  }
  const projectId = normalizeUuid(record.projectId, 'projectId');
  const garmentId = normalizeUuid(record.garmentId, 'garmentId');
  const sourceArtifactId = normalizeSourceArtifactId(record.sourceArtifactId);
  const clientRequestId = normalizeClientRequestId(record.clientRequestId);
  return Object.freeze({ projectId, sourceArtifactId, garmentId, clientRequestId });
}

export function fashionTryOnPhaseRequestIds(clientRequestIdValue: unknown): FashionTryOnOrchestrationPhaseRequestIdsV1 {
  const clientRequestId = normalizeClientRequestId(clientRequestIdValue);
  const garmentWarp = `${clientRequestId}${FASHION_TRYON_WARP_PHASE_SUFFIX}`;
  const textureComposite = `${clientRequestId}${FASHION_TRYON_TEXTURE_PHASE_SUFFIX}`;
  assertLocalRequestId(garmentWarp);
  assertLocalRequestId(textureComposite);
  return Object.freeze({ garmentWarp, textureComposite });
}

const normalizedDefaults = normalizeGarmentTextureCompositeProducerParameters({
  schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  textureTransform: {
    scaleXQ16: 65_536,
    scaleYQ16: 65_536,
    offsetXQ16: 0,
    offsetYQ16: 0,
    wrapMode: GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
    alphaPolicy: GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  },
  featherRadius: FASHION_TRYON_DEFAULT_FEATHER_RADIUS_V1,
  colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
});

export const FASHION_TRYON_TEXTURE_COMPOSITE_DEFAULTS_V1 = normalizedDefaults.document;
export const FASHION_TRYON_TEXTURE_COMPOSITE_DEFAULTS_CANONICAL_JSON_V1 = normalizedDefaults.canonicalJson;

function normalizeUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw contractError('fashion_tryon_orchestration_invalid_request', `${label} must be a UUID`);
  }
  return value.toLowerCase();
}

function normalizeSourceArtifactId(value: unknown): string {
  if (typeof value !== 'string') {
    throw contractError('fashion_tryon_orchestration_invalid_request', 'sourceArtifactId must be a string');
  }
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > FASHION_TRYON_MAX_SOURCE_ARTIFACT_ID_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(normalized)
  ) throw contractError('fashion_tryon_orchestration_invalid_request', 'sourceArtifactId is outside the accepted identifier contract');
  return normalized;
}

function normalizeClientRequestId(value: unknown): string {
  if (typeof value !== 'string') {
    throw contractError('fashion_tryon_orchestration_invalid_request', 'clientRequestId must be a string');
  }
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > FASHION_TRYON_MAX_CLIENT_REQUEST_ID_LENGTH
    || !CLIENT_REQUEST_PATTERN.test(normalized)
  ) throw contractError(
    'fashion_tryon_orchestration_invalid_request',
    `clientRequestId must contain 1 to ${FASHION_TRYON_MAX_CLIENT_REQUEST_ID_LENGTH} safe identifier characters`,
  );
  return normalized;
}

function assertLocalRequestId(value: string): void {
  if (value.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value)) {
    throw new Error('Fashion Try-On phase request ID escaped the existing local-execution identifier contract');
  }
}

function contractError(statusCode: string, message: string): Error & { status: 400; code: string } {
  return Object.assign(new Error(message), { status: 400 as const, code: statusCode });
}
