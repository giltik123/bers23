import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { GarmentOwnerScope } from './postgresGarmentStore.ts';
import { PostgresGarmentStore } from './postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore, type GarmentCategory } from './postgresGarmentWardrobeStore.ts';
import { PostgresGarmentRepresentationStore } from './postgresGarmentRepresentationStore.ts';
import { ManagedGarmentLocalExecutionInputAuthority } from '../localExecution/ManagedGarmentLocalExecutionInputAuthority.ts';
import {
  BODY_ANCHOR_COORDINATE_SPACE,
  BODY_ANCHOR_SCHEMA_ID,
  BodyAnchorGeometryError,
  bodyAnchorPayloadSha256,
  deriveDestinationGarmentMesh,
  normalizeBodyAnchorPayload,
  type BodyAnchorPayload,
  type GarmentDestinationMesh,
} from './bodyAnchorGeometry.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const POSITIVE_BIGINT_PATTERN = /^[1-9][0-9]*$/;

export type ManagedProjectBodyAnchorSet = Readonly<{
  id: string;
  projectId: string;
  projectImageStorageId: string;
  projectImageSha256: string;
  projectImageWidth: number;
  projectImageHeight: number;
  schemaId: typeof BODY_ANCHOR_SCHEMA_ID;
  coordinateSpace: typeof BODY_ANCHOR_COORDINATE_SPACE;
  payload: BodyAnchorPayload;
  payloadSha256: string;
  producerId: string;
  producerVersion: string;
  acquisitionSequence: string;
  createdAt: string;
}>;

export type CreateProjectBodyAnchorSetInput = Readonly<{
  payload: unknown;
  producerId: unknown;
  producerVersion: unknown;
}>;

export type ProjectBodyAnchorExpectedImage = Readonly<{
  storageId: string;
  sha256: string;
  width: number;
  height: number;
}>;

type RepresentationReader = Pick<PostgresGarmentRepresentationStore, 'loadPayload'>;
type WardrobeReader = Pick<PostgresGarmentWardrobeStore, 'get'>;
type ManagedInputAuthority = Pick<ManagedGarmentLocalExecutionInputAuthority, 'bindParametricRepresentation'>;

export type ProjectBodyAnchorStoreDependencies = Readonly<{
  wardrobe: WardrobeReader;
  representations: RepresentationReader;
  managedInputs: ManagedInputAuthority;
}>;

type CurrentProjectImage = ProjectBodyAnchorExpectedImage;

export class PostgresProjectBodyAnchorStore {
  private readonly dependencies: ProjectBodyAnchorStoreDependencies;

  constructor(
    private readonly pool: Pool,
    dependencies?: ProjectBodyAnchorStoreDependencies,
    private readonly nextId: () => string = randomUUID,
  ) {
    if (dependencies) {
      this.dependencies = dependencies;
    } else {
      const garments = new PostgresGarmentStore(pool);
      const representations = new PostgresGarmentRepresentationStore(pool);
      this.dependencies = Object.freeze({
        wardrobe: new PostgresGarmentWardrobeStore(pool),
        representations,
        managedInputs: new ManagedGarmentLocalExecutionInputAuthority({ garments, representations }),
      });
    }
  }

  async create(
    scope: GarmentOwnerScope,
    projectIdValue: string,
    input: CreateProjectBodyAnchorSetInput,
  ): Promise<ManagedProjectBodyAnchorSet> {
    return this.createInternal(scope, projectIdValue, input, undefined);
  }

  async createForExpectedImage(
    scope: GarmentOwnerScope,
    projectIdValue: string,
    expectedImageValue: ProjectBodyAnchorExpectedImage,
    input: CreateProjectBodyAnchorSetInput,
  ): Promise<ManagedProjectBodyAnchorSet> {
    const expectedImage = normalizeExpectedImage(expectedImageValue);
    return this.createInternal(scope, projectIdValue, input, expectedImage);
  }

  private async createInternal(
    scope: GarmentOwnerScope,
    projectIdValue: string,
    input: CreateProjectBodyAnchorSetInput,
    expectedImage: ProjectBodyAnchorExpectedImage | undefined,
  ): Promise<ManagedProjectBodyAnchorSet> {
    const projectId = normalizeUuid(projectIdValue, 'body_anchor_project_not_found', 404);
    const payload = normalizeBodyAnchorPayload(input?.payload);
    const payloadSha256 = bodyAnchorPayloadSha256(payload);
    const producerId = normalizeProvenance(input?.producerId, 'producerId');
    const producerVersion = normalizeProvenance(input?.producerVersion, 'producerVersion');
    const anchorSetId = normalizeGeneratedId(this.nextId());
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const image = await loadCurrentProjectImage(client, scope, projectId, true);
      if (!image) throw anchorError(404, 'body_anchor_project_not_found', 'Project not found');
      if (expectedImage) assertExpectedImageMatches(expectedImage, image);
      await client.query(`INSERT INTO canonical_project_body_anchor_sets
        (anchor_set_id,tenant_id,user_id,project_id,project_image_storage_id,project_image_sha256,project_image_width,project_image_height,
         schema_id,coordinate_space,anchor_payload,anchor_payload_sha256,producer_id,producer_version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)`, [
        anchorSetId, scope.tenantId, scope.userId, projectId, image.storageId, image.sha256, image.width, image.height,
        BODY_ANCHOR_SCHEMA_ID, BODY_ANCHOR_COORDINATE_SPACE, JSON.stringify(payload), payloadSha256, producerId, producerVersion,
      ]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const created = await this.get(scope, projectId, anchorSetId);
    if (!created) throw new Error('Project body anchor set committed but could not be reloaded');
    return created;
  }

  async get(scope: GarmentOwnerScope, projectIdValue: string, anchorSetIdValue: string): Promise<ManagedProjectBodyAnchorSet | undefined> {
    if (!isUuid(projectIdValue) || !isUuid(anchorSetIdValue)) return undefined;
    const result = await this.pool.query(`SELECT * FROM canonical_project_body_anchor_sets
      WHERE anchor_set_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4`,
    [anchorSetIdValue.toLowerCase(), projectIdValue.toLowerCase(), scope.tenantId, scope.userId]);
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }

  async deriveDestinationMesh(
    scope: GarmentOwnerScope,
    projectIdValue: string,
    anchorSetIdValue: string,
    garmentIdValue: string,
    representationIdValue: string,
  ): Promise<GarmentDestinationMesh> {
    const projectId = normalizeUuid(projectIdValue, 'body_anchor_set_not_found', 404);
    const anchorSetId = normalizeUuid(anchorSetIdValue, 'body_anchor_set_not_found', 404);
    const garmentId = normalizeUuid(garmentIdValue, 'body_anchor_garment_unavailable', 409);
    const representationId = normalizeUuid(representationIdValue, 'body_anchor_garment_representation_unavailable', 409);
    const anchorSet = await this.get(scope, projectId, anchorSetId);
    if (!anchorSet) throw anchorError(404, 'body_anchor_set_not_found', 'Body anchor set not found');

    const currentImage = await loadCurrentProjectImage(this.pool, scope, projectId, false);
    assertCurrentImageMatches(anchorSet, currentImage);

    const wardrobe = await this.dependencies.wardrobe.get(scope, garmentId);
    if (!wardrobe || wardrobe.status !== 'ACTIVE') throw anchorError(409, 'body_anchor_garment_unavailable', 'Managed Garment is unavailable for body-anchor geometry');

    let binding;
    try {
      binding = await this.dependencies.managedInputs.bindParametricRepresentation(scope, garmentId, representationId);
    } catch {
      throw anchorError(409, 'body_anchor_garment_representation_unavailable', 'Admitted PARAMETRIC Garment representation is unavailable');
    }
    const representationPayload = await this.dependencies.representations.loadPayload(scope, garmentId, representationId);
    if (!representationPayload) throw anchorError(409, 'body_anchor_garment_representation_unavailable', 'Garment representation payload is unavailable');
    const representationBytes = Uint8Array.from(representationPayload.bytes);
    const representationSha256 = sha256(representationBytes);
    if (
      representationPayload.contentType !== 'application/vnd.bers.garment-parametric+json'
      || representationSha256 !== representationPayload.contentSha256
      || representationSha256 !== binding.contentSha256
    ) throw anchorError(409, 'body_anchor_garment_representation_integrity_mismatch', 'Garment representation bytes do not match admitted authority');

    const topology = parseParametricTopology(representationBytes);
    const provenance = Object.freeze({
      anchorSetId: anchorSet.id,
      projectId: anchorSet.projectId,
      projectImageStorageId: anchorSet.projectImageStorageId,
      projectImageSha256: anchorSet.projectImageSha256,
      projectImageWidth: anchorSet.projectImageWidth,
      projectImageHeight: anchorSet.projectImageHeight,
      anchorPayloadSha256: anchorSet.payloadSha256,
      garmentId,
      representationId,
      representationContentSha256: representationSha256,
      garmentCategory: wardrobe.category as GarmentCategory,
    });

    let mesh: GarmentDestinationMesh;
    try {
      mesh = deriveDestinationGarmentMesh({
        anchorPayload: anchorSet.payload,
        garmentCategory: wardrobe.category,
        sourcePoints: topology.points,
        triangles: topology.triangles,
        provenance,
      });
    } catch (error) {
      if (error instanceof BodyAnchorGeometryError) throw Object.assign(error, { status: 409 });
      throw error;
    }

    const currentImageAfter = await loadCurrentProjectImage(this.pool, scope, projectId, false);
    assertCurrentImageMatches(anchorSet, currentImageAfter);
    try {
      const bindingAfter = await this.dependencies.managedInputs.bindParametricRepresentation(scope, garmentId, representationId);
      if (JSON.stringify(bindingAfter) !== JSON.stringify(binding)) {
        throw anchorError(409, 'body_anchor_garment_representation_stale', 'Garment representation authority changed during destination mesh derivation');
      }
    } catch (error) {
      if (isBodyAnchorError(error)) throw error;
      throw anchorError(409, 'body_anchor_garment_representation_stale', 'Garment representation authority changed during destination mesh derivation');
    }
    return mesh;
  }
}

function fromRow(row: any): ManagedProjectBodyAnchorSet {
  const payload = normalizeBodyAnchorPayload(row.anchor_payload);
  const payloadSha256 = bodyAnchorPayloadSha256(payload);
  if (!SHA256_PATTERN.test(String(row.anchor_payload_sha256)) || payloadSha256 !== String(row.anchor_payload_sha256)) {
    throw anchorError(409, 'body_anchor_integrity_mismatch', 'Stored body anchor payload does not match its canonical SHA-256');
  }
  const projectImageSha256 = String(row.project_image_sha256);
  if (!SHA256_PATTERN.test(projectImageSha256)) throw anchorError(409, 'body_anchor_integrity_mismatch', 'Stored Project image SHA-256 is invalid');
  const acquisitionSequence = String(row.acquisition_sequence);
  if (!POSITIVE_BIGINT_PATTERN.test(acquisitionSequence)) throw anchorError(409, 'body_anchor_integrity_mismatch', 'Stored body anchor acquisition sequence is invalid');
  return Object.freeze({
    id: String(row.anchor_set_id).toLowerCase(),
    projectId: String(row.project_id).toLowerCase(),
    projectImageStorageId: String(row.project_image_storage_id).toLowerCase(),
    projectImageSha256,
    projectImageWidth: Number(row.project_image_width),
    projectImageHeight: Number(row.project_image_height),
    schemaId: BODY_ANCHOR_SCHEMA_ID,
    coordinateSpace: BODY_ANCHOR_COORDINATE_SPACE,
    payload,
    payloadSha256,
    producerId: String(row.producer_id),
    producerVersion: String(row.producer_version),
    acquisitionSequence,
    createdAt: new Date(row.created_at).toISOString(),
  });
}

async function loadCurrentProjectImage(
  queryable: Pool | PoolClient,
  scope: GarmentOwnerScope,
  projectId: string,
  lockProject: boolean,
): Promise<CurrentProjectImage | undefined> {
  const result = await queryable.query(`SELECT
      p.current_image_storage_id,p.width AS project_width,p.height AS project_height,
      a.storage_id,a.width,a.height,a.encoding,a.content_type,a.image_bytes,a.role,a.lifecycle
    FROM canonical_projects p
    JOIN canonical_image_artifacts a
      ON a.storage_id=p.current_image_storage_id
     AND a.tenant_id=p.tenant_id
     AND a.user_id=p.user_id
     AND a.project_id=p.project_id::text
    WHERE p.project_id=$1 AND p.tenant_id=$2 AND p.user_id=$3 AND p.deleted_at IS NULL
      AND a.revoked_at IS NULL AND a.deleted_at IS NULL
      AND ((a.role='ORIGINAL' AND a.lifecycle='IMMUTABLE') OR (a.role='COMPOSITE' AND a.lifecycle='FINAL'))
    ${lockProject ? 'FOR UPDATE OF p' : ''}`, [projectId, scope.tenantId, scope.userId]);
  const row = result.rows[0];
  if (!row) return undefined;
  const width = Number(row.width); const height = Number(row.height);
  if (
    row.encoding !== 'PNG_RGBA8_LOSSLESS' || row.content_type !== 'image/png'
    || !Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1
    || width !== Number(row.project_width) || height !== Number(row.project_height)
  ) throw anchorError(409, 'body_anchor_project_image_invalid', 'Current Project image is outside the canonical image contract');
  const bytes = new Uint8Array(row.image_bytes);
  if (bytes.byteLength < 1) throw anchorError(409, 'body_anchor_project_image_invalid', 'Current Project image bytes are unavailable');
  return Object.freeze({ storageId: String(row.storage_id).toLowerCase(), sha256: sha256(bytes), width, height });
}

function assertExpectedImageMatches(expected: ProjectBodyAnchorExpectedImage, current: CurrentProjectImage): void {
  if (
    expected.storageId !== current.storageId
    || expected.sha256 !== current.sha256
    || expected.width !== current.width
    || expected.height !== current.height
  ) throw anchorError(409, 'body_anchor_expected_project_image_stale', 'Expected Project image is no longer current; no body anchors were persisted');
}

function assertCurrentImageMatches(anchorSet: ManagedProjectBodyAnchorSet, currentImage: CurrentProjectImage | undefined): void {
  if (
    !currentImage
    || currentImage.storageId !== anchorSet.projectImageStorageId
    || currentImage.sha256 !== anchorSet.projectImageSha256
    || currentImage.width !== anchorSet.projectImageWidth
    || currentImage.height !== anchorSet.projectImageHeight
  ) throw anchorError(409, 'body_anchor_project_evidence_stale', 'Body anchor evidence no longer matches the current canonical Project image');
}

function parseParametricTopology(bytes: Uint8Array): Readonly<{ points: readonly unknown[]; triangles: readonly unknown[] }> {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw anchorError(409, 'body_anchor_garment_representation_integrity_mismatch', 'PARAMETRIC representation bytes are not valid UTF-8 JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw anchorError(409, 'body_anchor_garment_representation_integrity_mismatch', 'PARAMETRIC representation payload is invalid');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const expected = ['coordinateSpace', 'outline', 'points', 'schemaVersion', 'triangles'];
  if (keys.length !== expected.length || expected.some((key, index) => keys[index] !== key)
      || record.schemaVersion !== 1 || record.coordinateSpace !== 'PRIMARY_VIEW_NORMALIZED'
      || !Array.isArray(record.points) || !Array.isArray(record.triangles) || !Array.isArray(record.outline)) {
    throw anchorError(409, 'body_anchor_garment_representation_integrity_mismatch', 'PARAMETRIC representation is outside BERS_PARAMETRIC_V1');
  }
  return Object.freeze({ points: record.points, triangles: record.triangles });
}

function normalizeExpectedImage(value: ProjectBodyAnchorExpectedImage): ProjectBodyAnchorExpectedImage {
  if (!value || typeof value !== 'object') throw anchorError(400, 'invalid_body_anchor_expected_image', 'Expected Project image evidence is required');
  const storageId = normalizeUuid(value.storageId, 'invalid_body_anchor_expected_image', 400);
  const sha = typeof value.sha256 === 'string' ? value.sha256.toLowerCase() : '';
  if (!SHA256_PATTERN.test(sha)) throw anchorError(400, 'invalid_body_anchor_expected_image', 'Expected Project image SHA-256 is invalid');
  const width = Number(value.width); const height = Number(value.height);
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) {
    throw anchorError(400, 'invalid_body_anchor_expected_image', 'Expected Project image geometry is invalid');
  }
  return Object.freeze({ storageId, sha256: sha, width, height });
}

function normalizeProvenance(value: unknown, field: string): string {
  if (typeof value !== 'string') throw anchorError(400, 'invalid_body_anchor_provenance', `${field} must be a string`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || [...normalized].length > 100 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw anchorError(400, 'invalid_body_anchor_provenance', `${field} must contain 1 to 100 printable characters`);
  }
  return normalized;
}
function normalizeGeneratedId(value: string): string {
  const id = String(value).toLowerCase();
  if (!UUID_PATTERN.test(id)) throw new Error('Body anchor set ID generator returned an invalid UUID');
  return id;
}
function normalizeUuid(value: unknown, code: string, status: number): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw anchorError(status, code, status === 404 ? 'Resource not found' : 'Invalid UUID');
  return value.toLowerCase();
}
function isUuid(value: unknown): value is string { return typeof value === 'string' && UUID_PATTERN.test(value); }
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function isBodyAnchorError(error: unknown): error is Error & { status: number; code: string } {
  return Boolean(error && typeof error === 'object' && typeof (error as any).status === 'number' && typeof (error as any).code === 'string');
}
function anchorError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
