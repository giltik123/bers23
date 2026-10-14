import { createHash } from 'node:crypto';

/**
 * R&D-only foreground matte evidence binding. This function performs
 * byte/lineage checks; it DOES NOT grant access to a Project or authority
 * to submit an executable Fashion candidate. Never use its result as a
 * substitute for authenticated Core ownership/admission.
 */
export type ForegroundMatteEvidenceV1 = Readonly<{
  schemaVersion: 1;
  kind: 'BERS_FASHION_FOREGROUND_MATTE_RND_V1';
  tenantId: string;
  projectId: string;
  projectImageSha256: string;
  projectWidth: number;
  projectHeight: number;
  garmentLayerSha256: string;
  matteSha256: string;
  source: 'MANUALLY_REVIEWED';
  reviewerId: string;
}>;

export function verifyForegroundMatteEvidence(
  evidence: ForegroundMatteEvidenceV1,
  expected: Readonly<{
    tenantId: string;
    projectId: string;
    projectImageSha256: string;
    projectWidth: number;
    projectHeight: number;
    garmentLayerSha256: string;
  }>,
  matte: Uint8Array | Uint8ClampedArray,
): ForegroundMatteEvidenceV1 {
  if (!evidence || typeof evidence !== 'object' ||
      evidence.schemaVersion !== 1 || evidence.kind !== 'BERS_FASHION_FOREGROUND_MATTE_RND_V1') {
    throw new Error('Foreground matte evidence schema is not accepted');
  }
  if (!expected || typeof expected !== 'object') throw new Error('Expected Project binding is required');
  for (const key of ['tenantId', 'projectId', 'reviewerId'] as const) {
    if (typeof evidence[key] !== 'string' || !evidence[key].trim() || evidence[key].length > 200) {
      throw new Error(`Foreground matte ${key} is invalid`);
    }
  }
  if (evidence.source !== 'MANUALLY_REVIEWED') {
    throw new Error('Foreground matte has no admitted R&D review source');
  }
  for (const key of ['projectImageSha256', 'garmentLayerSha256', 'matteSha256'] as const) {
    if (!/^[0-9a-f]{64}$/.test(evidence[key])) throw new Error(`Foreground matte ${key} must be lowercase SHA-256`);
  }
  if (!Number.isSafeInteger(evidence.projectWidth) || !Number.isSafeInteger(evidence.projectHeight) ||
      evidence.projectWidth < 1 || evidence.projectHeight < 1 ||
      evidence.projectWidth > 4096 || evidence.projectHeight > 4096 ||
      evidence.projectWidth * evidence.projectHeight > 4096 * 2048) {
    throw new Error('Foreground matte geometry exceeds bounded Project limits');
  }
  for (const key of ['tenantId', 'projectId', 'projectImageSha256', 'projectWidth', 'projectHeight', 'garmentLayerSha256'] as const) {
    if (evidence[key] !== expected[key]) throw new Error(`Foreground matte stale or cross-Project binding: ${key}`);
  }
  if (!(matte instanceof Uint8Array) && !(matte instanceof Uint8ClampedArray)) {
    throw new Error('Foreground matte must be byte coverage');
  }
  if (matte.byteLength !== evidence.projectWidth * evidence.projectHeight) {
    throw new Error('Foreground matte coverage length does not match the bound Project');
  }
  const actual = createHash('sha256').update(matte).digest('hex');
  if (actual !== evidence.matteSha256) throw new Error('Foreground matte coverage SHA-256 mismatch');
  return Object.freeze({ ...evidence });
}
