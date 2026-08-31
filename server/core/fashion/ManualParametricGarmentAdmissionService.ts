import { createHash } from 'node:crypto';
import type { GarmentOwnerScope, ManagedGarment } from './postgresGarmentStore.ts';
import type {
  ManagedGarmentRepresentation,
  PostgresGarmentRepresentationStore,
} from './postgresGarmentRepresentationStore.ts';
import {
  MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID,
  MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION,
  produceManualParametricRepresentation,
} from './manualParametricContour.ts';
import type { PostgresGarmentStore } from './postgresGarmentStore.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARAMETRIC_CONTENT_TYPE = 'application/vnd.bers.garment-parametric+json';

type GarmentReader = Pick<PostgresGarmentStore, 'get'>;
type RepresentationAuthority = Pick<PostgresGarmentRepresentationStore, 'list' | 'loadPayload' | 'admit'>;

export type ManualParametricGarmentAdmissionCommand = Readonly<{
  garmentId: string;
  expectedRevision: number;
  contour: unknown;
}>;

export type ManualParametricGarmentAdmissionResult = Readonly<{
  garmentRevision: number;
  representationTier: 'PARAMETRIC' | 'FULL_3D';
  representation: ManagedGarmentRepresentation;
  replayed: boolean;
}>;

export class ManualParametricGarmentAdmissionService {
  constructor(private readonly dependencies: Readonly<{
    garments: GarmentReader;
    representations: RepresentationAuthority;
  }>) {}

  async admit(
    scope: GarmentOwnerScope,
    command: ManualParametricGarmentAdmissionCommand,
  ): Promise<ManualParametricGarmentAdmissionResult> {
    const garmentId = normalizeGarmentId(command?.garmentId);
    const expectedRevision = normalizeExpectedRevision(command?.expectedRevision);
    const garment = await this.dependencies.garments.get(scope, garmentId);
    if (!garment) throw admissionError(404, 'garment_not_found', 'Garment not found');
    if (garment.status !== 'ACTIVE') {
      throw admissionError(409, 'manual_parametric_garment_not_active', 'Only an active Garment can admit manual PARAMETRIC geometry');
    }
    const primaryView = currentPrimaryView(garment);
    const payload = produceManualParametricRepresentation(command?.contour);
    const canonicalBytes = new TextEncoder().encode(JSON.stringify(payload));
    const contentSha256 = sha256(canonicalBytes);

    const replay = await this.findExactReplay(scope, garment, primaryView.contentSha256, canonicalBytes, contentSha256);
    if (replay) {
      return Object.freeze({
        garmentRevision: garment.revision,
        representationTier: garment.representationTier === 'FULL_3D' ? 'FULL_3D' : 'PARAMETRIC',
        representation: replay,
        replayed: true,
      });
    }

    if (garment.revision !== expectedRevision) {
      throw admissionError(409, 'garment_revision_conflict', 'Garment revision changed; refresh before admitting manual PARAMETRIC geometry');
    }

    const admitted = await this.dependencies.representations.admit(scope, garmentId, expectedRevision, {
      tier: 'PARAMETRIC',
      generatorId: MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID,
      generatorVersion: MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION,
      sourceViewIds: Object.freeze([garment.primaryViewId]),
      payload,
    });
    assertAdmittedResult(admitted.representation, garment.primaryViewId, primaryView.contentSha256, contentSha256);
    return Object.freeze({ ...admitted, replayed: false });
  }

  private async findExactReplay(
    scope: GarmentOwnerScope,
    garment: ManagedGarment,
    primaryViewSha256: string,
    canonicalBytes: Uint8Array,
    contentSha256: string,
  ): Promise<ManagedGarmentRepresentation | undefined> {
    const representations = await this.dependencies.representations.list(scope, garment.id);
    for (const candidate of representations) {
      if (candidate.contentSha256 !== contentSha256) continue;
      const loaded = await this.dependencies.representations.loadPayload(scope, garment.id, candidate.id);
      if (!loaded || loaded.contentSha256 !== candidate.contentSha256 || loaded.contentType !== PARAMETRIC_CONTENT_TYPE) {
        throw admissionError(409, 'manual_parametric_existing_integrity_mismatch', 'Existing representation payload cannot be revalidated');
      }
      if (!bytesEqual(loaded.bytes, canonicalBytes)) {
        throw admissionError(409, 'manual_parametric_content_hash_collision', 'Existing representation hash matches different canonical bytes');
      }
      if (!isExactManualReplay(candidate, garment.primaryViewId, primaryViewSha256)) {
        throw admissionError(409, 'manual_parametric_existing_provenance_conflict', 'Exact representation bytes already exist with different provenance or source binding');
      }
      return candidate;
    }
    return undefined;
  }
}

function currentPrimaryView(garment: ManagedGarment) {
  const view = garment.views.find(candidate => candidate.id === garment.primaryViewId);
  if (!view) throw admissionError(409, 'manual_parametric_primary_view_unavailable', 'Current Garment primary view is unavailable');
  return view;
}

function isExactManualReplay(
  candidate: ManagedGarmentRepresentation,
  primaryViewId: string,
  primaryViewSha256: string,
): boolean {
  return candidate.tier === 'PARAMETRIC'
    && candidate.format === 'BERS_PARAMETRIC_V1'
    && candidate.contentType === PARAMETRIC_CONTENT_TYPE
    && candidate.admissionState === 'ADMITTED'
    && candidate.revokedAt === null
    && candidate.generatorId === MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID
    && candidate.generatorVersion === MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION
    && candidate.basisViewId === primaryViewId
    && candidate.sources.length === 1
    && candidate.sources[0].position === 0
    && candidate.sources[0].viewId === primaryViewId
    && candidate.sources[0].contentSha256 === primaryViewSha256;
}

function assertAdmittedResult(
  representation: ManagedGarmentRepresentation,
  primaryViewId: string,
  primaryViewSha256: string,
  expectedContentSha256: string,
): void {
  if (
    representation.contentSha256 !== expectedContentSha256
    || !isExactManualReplay(representation, primaryViewId, primaryViewSha256)
  ) throw new Error('Manual PARAMETRIC admission returned representation evidence outside the requested canonical authority');
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function normalizeGarmentId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw admissionError(404, 'garment_not_found', 'Garment not found');
  return value.toLowerCase();
}

function normalizeExpectedRevision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw admissionError(400, 'invalid_garment_revision', 'Expected Garment revision must be a positive safe integer');
  }
  return Number(value);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function admissionError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
