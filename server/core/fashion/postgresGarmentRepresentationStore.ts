import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { GarmentOwnerScope } from './postgresGarmentStore.ts';
import {
  MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID,
  MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION,
  produceManualParametricRepresentation,
} from './manualParametricContour.ts';
import { validateGlbExecutionSubset } from './glbExecutionSubsetValidator.ts';

export const GARMENT_REPRESENTATION_TIERS = Object.freeze(['PARAMETRIC', 'FULL_3D'] as const);
export type GarmentRepresentationTier = (typeof GARMENT_REPRESENTATION_TIERS)[number];
export type GarmentRepresentationFormat = 'BERS_PARAMETRIC_V1' | 'GLB_2_0';
export type GarmentRepresentationState = 'ADMITTED' | 'REVOKED';

export const MAX_GARMENT_REPRESENTATION_BYTES = 64 * 1024 * 1024;
export const PARAMETRIC_VALIDATOR_ID = 'bers.parametric-topology-validator';
export const PARAMETRIC_VALIDATOR_VERSION = '1';
export const GLB_VALIDATOR_ID = 'bers.glb-structural-validator';
export const GLB_VALIDATOR_VERSION = '2';

export type GarmentRepresentationSource = Readonly<{
  position: number;
  viewId: string;
  contentSha256: string;
}>;

export type ManagedGarmentRepresentation = Readonly<{
  id: string;
  garmentId: string;
  tier: GarmentRepresentationTier;
  format: GarmentRepresentationFormat;
  contentType: 'application/vnd.bers.garment-parametric+json' | 'model/gltf-binary';
  contentSha256: string;
  byteSize: number;
  storageBackend: 'POSTGRES_BYTEA_V1';
  basisViewId: string;
  generatorId: string;
  generatorVersion: string;
  validatorId: string;
  validatorVersion: string;
  admissionState: GarmentRepresentationState;
  admittedAt: string;
  revokedAt: string | null;
  sources: readonly GarmentRepresentationSource[];
}>;

export type ParametricGarmentRepresentationInput = Readonly<{
  tier: 'PARAMETRIC';
  generatorId: unknown;
  generatorVersion: unknown;
  sourceViewIds: readonly unknown[];
  payload: unknown;
}>;

export type Full3dGarmentRepresentationInput = Readonly<{
  tier: 'FULL_3D';
  generatorId: unknown;
  generatorVersion: unknown;
  sourceViewIds: readonly unknown[];
  bytes: Uint8Array;
}>;

export type AdmitGarmentRepresentationInput = ParametricGarmentRepresentationInput | Full3dGarmentRepresentationInput;
export type ManualParametricContourAdmissionResult = Readonly<{
  garmentRevision: number;
  representationTier: 'PARAMETRIC' | 'FULL_3D';
  representation: ManagedGarmentRepresentation;
  replayed: boolean;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARAMETRIC_KEYS = Object.freeze(['schemaVersion', 'coordinateSpace', 'points', 'triangles', 'outline'] as const);
const MAX_PARAMETRIC_POINTS = 4096;
const MAX_PARAMETRIC_TRIANGLES = 8192;
const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;

export class PostgresGarmentRepresentationStore {
  constructor(private readonly pool: Pool, private readonly nextId: () => string = randomUUID) {}

  async admitManualParametricContour(
    scope: GarmentOwnerScope,
    garmentIdValue: string,
    expectedRevision: number,
    contour: unknown,
  ): Promise<ManualParametricContourAdmissionResult> {
    const garmentId = normalizeUuid(garmentIdValue, 'garment_not_found', 404);
    validateExpectedRevision(expectedRevision);
    const bytes = canonicalizeParametricPayload(produceManualParametricRepresentation(contour));
    assertPayloadSize(bytes.byteLength);
    const contentSha256 = sha256(bytes);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const garment = await lockGarment(client, scope, garmentId);
      if (!garment) throw notFound();
      if (garment.status !== 'ACTIVE') {
        throw httpError(409, 'manual_parametric_garment_not_active', 'Only an active Garment can admit manual PARAMETRIC geometry');
      }
      if (garment.category === 'other') {
        throw httpError(409, 'manual_parametric_category_requires_classification', 'Garment must be classified before manual PARAMETRIC geometry can be admitted');
      }
      const primary = await loadCurrentPrimarySource(client, scope, garmentId, garment.primaryViewId);

      const replayRow = await loadRepresentationByContentAndBasis(client, scope, garmentId, contentSha256, garment.primaryViewId);
      if (replayRow) {
        const candidate = fromRepresentationRow(replayRow);
        const storedBytes = new Uint8Array(replayRow.representation_bytes);
        if (!bytesEqual(storedBytes, bytes)) {
          throw httpError(409, 'manual_parametric_content_hash_collision', 'Existing representation hash matches different canonical bytes');
        }
        if (!isExactManualParametricReplay(candidate, primary.contentSha256, contentSha256, bytes.byteLength)) {
          throw httpError(409, 'manual_parametric_existing_provenance_conflict', 'Exact representation bytes already exist with different provenance, validator or source binding');
        }
        if (garment.representationTier === 'BASIC') {
          throw httpError(409, 'manual_parametric_summary_integrity_mismatch', 'Admitted manual PARAMETRIC evidence is inconsistent with the Garment representation summary');
        }
        const result = Object.freeze({
          garmentRevision: garment.revision,
          representationTier: garment.representationTier,
          representation: candidate,
          replayed: true,
        }) satisfies ManualParametricContourAdmissionResult;
        await client.query('COMMIT');
        return result;
      }

      if (garment.revision !== expectedRevision) throw revisionConflict();
      const representationId = this.nextId().toLowerCase();
      if (!UUID_PATTERN.test(representationId)) throw new Error('Representation ID generator returned an invalid UUID');
      try {
        await client.query(`INSERT INTO canonical_garment_representations
          (representation_id,garment_id,tenant_id,user_id,tier,format,content_type,content_sha256,byte_size,storage_backend,representation_bytes,basis_view_id,source_count,generator_id,generator_version,validator_id,validator_version,admission_state)
          VALUES ($1,$2,$3,$4,'PARAMETRIC','BERS_PARAMETRIC_V1','application/vnd.bers.garment-parametric+json',$5,$6,'POSTGRES_BYTEA_V1',$7,$8,1,$9,$10,$11,$12,'ADMITTED')`,
        [representationId, garmentId, scope.tenantId, scope.userId, contentSha256, bytes.byteLength, Buffer.from(bytes), garment.primaryViewId,
          MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID, MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION, PARAMETRIC_VALIDATOR_ID, PARAMETRIC_VALIDATOR_VERSION]);
      } catch (error) {
        if (isConstraintViolation(error, 'canonical_garment_representations_garment_content_unique')) {
          throw httpError(409, 'manual_parametric_existing_provenance_conflict', 'Manual PARAMETRIC content/basis identity already exists with conflicting evidence');
        }
        throw error;
      }
      await client.query(`INSERT INTO canonical_garment_representation_sources
        (representation_id,garment_id,tenant_id,user_id,source_position,view_id,source_content_sha256)
        VALUES ($1,$2,$3,$4,0,$5,$6)`,
      [representationId, garmentId, scope.tenantId, scope.userId, garment.primaryViewId, primary.contentSha256]);

      const nextTier = await highestAdmittedTier(client, scope, garmentId);
      if (nextTier === 'BASIC') throw new Error('Manual PARAMETRIC admission did not advance the Garment representation summary');
      const updated = await client.query(`UPDATE canonical_garments
        SET representation_tier=$4,revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND revision=$5
        RETURNING revision`, [garmentId, scope.tenantId, scope.userId, nextTier, garment.revision]);
      const garmentRevision = Number(updated.rows[0]?.revision);
      if (updated.rowCount !== 1 || garmentRevision !== garment.revision + 1) throw revisionConflict();

      const representation = await loadRepresentationById(client, scope, garmentId, representationId);
      if (!representation) throw new Error('Manual PARAMETRIC admission could not read its transactional representation snapshot');
      if (!isExactManualParametricReplay(representation, primary.contentSha256, contentSha256, bytes.byteLength)) {
        throw new Error('Manual PARAMETRIC transactional representation snapshot escaped canonical authority');
      }
      const result = Object.freeze({ garmentRevision, representationTier: nextTier, representation, replayed: false }) satisfies ManualParametricContourAdmissionResult;
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async admit(
    scope: GarmentOwnerScope,
    garmentIdValue: string,
    expectedRevision: number,
    input: AdmitGarmentRepresentationInput,
  ): Promise<Readonly<{ garmentRevision: number; representationTier: 'PARAMETRIC' | 'FULL_3D'; representation: ManagedGarmentRepresentation }>> {
    const garmentId = normalizeUuid(garmentIdValue, 'garment_not_found', 404);
    validateExpectedRevision(expectedRevision);
    const normalized = normalizeAdmissionInput(input);
    const client = await this.pool.connect();
    let representationId = '';
    let nextTier: 'BASIC' | 'PARAMETRIC' | 'FULL_3D' = normalized.tier;
    try {
      await client.query('BEGIN');
      const garment = await lockGarment(client, scope, garmentId);
      if (!garment) throw notFound();
      if (garment.revision !== expectedRevision) throw revisionConflict();
      if (garment.status !== 'ACTIVE') throw httpError(409, 'garment_representation_garment_not_active', 'Only active Garments can admit new advanced representations');
      if (garment.category === 'other') {
        throw httpError(409, 'garment_representation_category_requires_classification', 'Garment must be classified before an advanced representation can be admitted');
      }

      const sources = await loadSourceViews(client, scope, garmentId, normalized.sourceViewIds);
      if (!sources.some(source => source.viewId === garment.primaryViewId)) {
        throw httpError(409, 'garment_representation_basis_view_required', 'Representation sources must include the current primary Garment view');
      }

      representationId = this.nextId().toLowerCase();
      if (!UUID_PATTERN.test(representationId)) throw new Error('Representation ID generator returned an invalid UUID');

      try {
        await client.query(`INSERT INTO canonical_garment_representations
          (representation_id,garment_id,tenant_id,user_id,tier,format,content_type,content_sha256,byte_size,storage_backend,representation_bytes,basis_view_id,source_count,generator_id,generator_version,validator_id,validator_version,admission_state)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'POSTGRES_BYTEA_V1',$10,$11,$12,$13,$14,$15,$16,'ADMITTED')`,
        [representationId, garmentId, scope.tenantId, scope.userId, normalized.tier, normalized.format, normalized.contentType,
          normalized.contentSha256, normalized.bytes.byteLength, Buffer.from(normalized.bytes), garment.primaryViewId, normalized.sourceViewIds.length,
          normalized.generatorId, normalized.generatorVersion, normalized.validatorId, normalized.validatorVersion]);
      } catch (error) {
        if (isConstraintViolation(error, 'canonical_garment_representations_garment_content_unique')) {
          throw httpError(409, 'garment_representation_duplicate_content', 'This exact representation payload is already recorded for the Garment and basis view');
        }
        throw error;
      }

      for (const source of sources) {
        await client.query(`INSERT INTO canonical_garment_representation_sources
          (representation_id,garment_id,tenant_id,user_id,source_position,view_id,source_content_sha256)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [representationId, garmentId, scope.tenantId, scope.userId, source.position, source.viewId, source.contentSha256]);
      }

      nextTier = await highestAdmittedTier(client, scope, garmentId);
      const updated = await client.query(`UPDATE canonical_garments
        SET representation_tier=$4,revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND revision=$5
        RETURNING revision`, [garmentId, scope.tenantId, scope.userId, nextTier, expectedRevision]);
      if (updated.rowCount !== 1 || Number(updated.rows[0]?.revision) !== expectedRevision + 1) throw revisionConflict();
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const representation = await this.get(scope, garmentId, representationId);
    if (!representation) throw new Error('Garment representation admission committed but could not be reloaded');
    if (nextTier === 'BASIC') throw new Error('Admitted representation did not advance the Garment representation summary');
    return Object.freeze({ garmentRevision: expectedRevision + 1, representationTier: nextTier, representation });
  }

  async revoke(
    scope: GarmentOwnerScope,
    garmentIdValue: string,
    representationIdValue: string,
    expectedRevision: number,
  ): Promise<Readonly<{ garmentRevision: number; representationTier: 'BASIC' | 'PARAMETRIC' | 'FULL_3D'; representation: ManagedGarmentRepresentation }>> {
    const garmentId = normalizeUuid(garmentIdValue, 'garment_not_found', 404);
    const representationId = normalizeUuid(representationIdValue, 'garment_representation_not_found', 404);
    validateExpectedRevision(expectedRevision);
    const client = await this.pool.connect();
    let nextTier: 'BASIC' | 'PARAMETRIC' | 'FULL_3D' = 'BASIC';
    let noOp = false;
    try {
      await client.query('BEGIN');
      const garment = await lockGarment(client, scope, garmentId);
      if (!garment) throw notFound();
      if (garment.revision !== expectedRevision) throw revisionConflict();

      const existing = await client.query(`SELECT admission_state FROM canonical_garment_representations
        WHERE representation_id=$1 AND garment_id=$2 AND tenant_id=$3 AND user_id=$4 FOR UPDATE`,
      [representationId, garmentId, scope.tenantId, scope.userId]);
      if (!existing.rows[0]) throw representationNotFound();
      if (String(existing.rows[0].admission_state) === 'REVOKED') {
        nextTier = garment.representationTier;
        noOp = true;
        await client.query('COMMIT');
      } else {
        await client.query(`UPDATE canonical_garment_representations
          SET admission_state='REVOKED',revoked_at=CURRENT_TIMESTAMP
          WHERE representation_id=$1 AND garment_id=$2 AND tenant_id=$3 AND user_id=$4 AND admission_state='ADMITTED'`,
        [representationId, garmentId, scope.tenantId, scope.userId]);
        nextTier = await highestAdmittedTier(client, scope, garmentId);
        const updated = await client.query(`UPDATE canonical_garments
          SET representation_tier=$4,revision=revision+1,updated_at=CURRENT_TIMESTAMP
          WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND revision=$5
          RETURNING revision`, [garmentId, scope.tenantId, scope.userId, nextTier, expectedRevision]);
        if (updated.rowCount !== 1 || Number(updated.rows[0]?.revision) !== expectedRevision + 1) throw revisionConflict();
        await client.query('COMMIT');
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const representation = await this.get(scope, garmentId, representationId);
    if (!representation) throw new Error('Garment representation revocation committed but could not be reloaded');
    return Object.freeze({ garmentRevision: noOp ? expectedRevision : expectedRevision + 1, representationTier: nextTier, representation });
  }

  async list(scope: GarmentOwnerScope, garmentIdValue: string): Promise<readonly ManagedGarmentRepresentation[]> {
    if (!isUuid(garmentIdValue)) return Object.freeze([]);
    const garmentId = garmentIdValue.toLowerCase();
    const result = await this.pool.query(`${REPRESENTATION_SELECT}
      WHERE r.garment_id=$1 AND r.tenant_id=$2 AND r.user_id=$3
        AND EXISTS (SELECT 1 FROM canonical_garments g WHERE g.garment_id=r.garment_id AND g.tenant_id=r.tenant_id AND g.user_id=r.user_id AND g.deleted_at IS NULL)
      ORDER BY r.admitted_at DESC,r.representation_id`, [garmentId, scope.tenantId, scope.userId]);
    return Object.freeze(result.rows.map(fromRepresentationRow));
  }

  async get(scope: GarmentOwnerScope, garmentIdValue: string, representationIdValue: string): Promise<ManagedGarmentRepresentation | undefined> {
    if (!isUuid(garmentIdValue) || !isUuid(representationIdValue)) return undefined;
    const result = await this.pool.query(`${REPRESENTATION_SELECT}
      WHERE r.representation_id=$1 AND r.garment_id=$2 AND r.tenant_id=$3 AND r.user_id=$4
        AND EXISTS (SELECT 1 FROM canonical_garments g WHERE g.garment_id=r.garment_id AND g.tenant_id=r.tenant_id AND g.user_id=r.user_id AND g.deleted_at IS NULL)`,
    [representationIdValue.toLowerCase(), garmentIdValue.toLowerCase(), scope.tenantId, scope.userId]);
    return result.rows[0] ? fromRepresentationRow(result.rows[0]) : undefined;
  }

  async loadPayload(
    scope: GarmentOwnerScope,
    garmentIdValue: string,
    representationIdValue: string,
  ): Promise<Readonly<{ bytes: Uint8Array; contentType: ManagedGarmentRepresentation['contentType']; contentSha256: string }> | undefined> {
    if (!isUuid(garmentIdValue) || !isUuid(representationIdValue)) return undefined;
    const result = await this.pool.query(`SELECT r.representation_bytes,r.content_type,r.content_sha256
      FROM canonical_garment_representations r
      JOIN canonical_garments g ON g.garment_id=r.garment_id AND g.tenant_id=r.tenant_id AND g.user_id=r.user_id
      WHERE r.representation_id=$1 AND r.garment_id=$2 AND r.tenant_id=$3 AND r.user_id=$4
        AND g.deleted_at IS NULL`,
    [representationIdValue.toLowerCase(), garmentIdValue.toLowerCase(), scope.tenantId, scope.userId]);
    const row = result.rows[0];
    if (!row) return undefined;
    return Object.freeze({
      bytes: new Uint8Array(row.representation_bytes),
      contentType: normalizeStoredContentType(row.content_type),
      contentSha256: String(row.content_sha256),
    });
  }
}

const REPRESENTATION_SELECT = `SELECT r.*,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'position',s.source_position,'viewId',s.view_id,'contentSha256',s.source_content_sha256
  ) ORDER BY s.source_position)
  FROM canonical_garment_representation_sources s
  WHERE s.representation_id=r.representation_id AND s.garment_id=r.garment_id AND s.tenant_id=r.tenant_id AND s.user_id=r.user_id), '[]'::jsonb) AS sources
  FROM canonical_garment_representations r`;

type LockedGarment = Readonly<{
  revision: number;
  status: 'ACTIVE' | 'ARCHIVED';
  category: string;
  primaryViewId: string;
  representationTier: 'BASIC' | 'PARAMETRIC' | 'FULL_3D';
}>;

async function lockGarment(client: PoolClient, scope: GarmentOwnerScope, garmentId: string): Promise<LockedGarment | undefined> {
  const result = await client.query(`SELECT revision,status,category,primary_view_id,representation_tier
    FROM canonical_garments WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL FOR UPDATE`,
  [garmentId, scope.tenantId, scope.userId]);
  const row = result.rows[0];
  if (!row) return undefined;
  return Object.freeze({
    revision: Number(row.revision),
    status: storedGarmentStatus(row.status),
    category: String(row.category),
    primaryViewId: String(row.primary_view_id).toLowerCase(),
    representationTier: storedSummaryTier(row.representation_tier),
  });
}

async function loadCurrentPrimarySource(
  client: PoolClient,
  scope: GarmentOwnerScope,
  garmentId: string,
  primaryViewId: string,
): Promise<Readonly<{ viewId: string; contentSha256: string }>> {
  const result = await client.query(`SELECT view_id,content_sha256 FROM canonical_garment_views
    WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND view_id=$4 AND revoked_at IS NULL AND deleted_at IS NULL`,
  [garmentId, scope.tenantId, scope.userId, primaryViewId]);
  const row = result.rows[0];
  if (!row || String(row.view_id).toLowerCase() !== primaryViewId) {
    throw httpError(409, 'manual_parametric_primary_view_unavailable', 'Current Garment primary view is unavailable');
  }
  return Object.freeze({ viewId: primaryViewId, contentSha256: String(row.content_sha256) });
}

async function loadRepresentationByContentAndBasis(
  client: PoolClient,
  scope: GarmentOwnerScope,
  garmentId: string,
  contentSha256: string,
  basisViewId: string,
): Promise<any | undefined> {
  const result = await client.query(`${REPRESENTATION_SELECT}
    WHERE r.garment_id=$1 AND r.tenant_id=$2 AND r.user_id=$3 AND r.content_sha256=$4 AND r.basis_view_id=$5
    ORDER BY r.representation_id`, [garmentId, scope.tenantId, scope.userId, contentSha256, basisViewId]);
  if (result.rowCount > 1) throw httpError(409, 'manual_parametric_existing_provenance_conflict', 'Content/basis identity is not unique');
  return result.rows[0];
}

async function loadRepresentationById(
  client: PoolClient,
  scope: GarmentOwnerScope,
  garmentId: string,
  representationId: string,
): Promise<ManagedGarmentRepresentation | undefined> {
  const result = await client.query(`${REPRESENTATION_SELECT}
    WHERE r.representation_id=$1 AND r.garment_id=$2 AND r.tenant_id=$3 AND r.user_id=$4`,
  [representationId, garmentId, scope.tenantId, scope.userId]);
  return result.rows[0] ? fromRepresentationRow(result.rows[0]) : undefined;
}

async function loadSourceViews(
  client: PoolClient,
  scope: GarmentOwnerScope,
  garmentId: string,
  viewIds: readonly string[],
): Promise<readonly GarmentRepresentationSource[]> {
  const result = await client.query(`SELECT view_id,content_sha256 FROM canonical_garment_views
    WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND view_id=ANY($4::uuid[])
      AND revoked_at IS NULL AND deleted_at IS NULL`, [garmentId, scope.tenantId, scope.userId, viewIds]);
  const byId = new Map<string, string>(result.rows.map(row => [String(row.view_id).toLowerCase(), String(row.content_sha256)] as const));
  if (byId.size !== viewIds.length || viewIds.some(id => !byId.has(id))) {
    throw httpError(409, 'garment_representation_source_unavailable', 'Every representation source must be a current managed view of the same Garment');
  }
  return Object.freeze(viewIds.map((viewId, position) => Object.freeze({ position, viewId, contentSha256: byId.get(viewId)! })));
}

async function highestAdmittedTier(client: PoolClient, scope: GarmentOwnerScope, garmentId: string): Promise<'BASIC' | 'PARAMETRIC' | 'FULL_3D'> {
  const result = await client.query(`SELECT CASE
    WHEN EXISTS (SELECT 1 FROM canonical_garment_representations WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND admission_state='ADMITTED' AND tier='FULL_3D') THEN 'FULL_3D'
    WHEN EXISTS (SELECT 1 FROM canonical_garment_representations WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND admission_state='ADMITTED' AND tier='PARAMETRIC') THEN 'PARAMETRIC'
    ELSE 'BASIC' END AS tier`, [garmentId, scope.tenantId, scope.userId]);
  return storedSummaryTier(result.rows[0]?.tier);
}

type NormalizedAdmission = Readonly<{
  tier: GarmentRepresentationTier;
  format: GarmentRepresentationFormat;
  contentType: ManagedGarmentRepresentation['contentType'];
  contentSha256: string;
  bytes: Uint8Array;
  sourceViewIds: readonly string[];
  generatorId: string;
  generatorVersion: string;
  validatorId: string;
  validatorVersion: string;
}>;

function normalizeAdmissionInput(input: AdmitGarmentRepresentationInput): NormalizedAdmission {
  if (!input || typeof input !== 'object') throw httpError(400, 'invalid_garment_representation', 'Representation admission input is required');
  const generatorId = normalizeProvenance(input.generatorId, 'generatorId');
  const generatorVersion = normalizeProvenance(input.generatorVersion, 'generatorVersion');
  const sourceViewIds = normalizeSourceViewIds(input.sourceViewIds);
  if (input.tier === 'PARAMETRIC') {
    const bytes = canonicalizeParametricPayload(input.payload);
    assertPayloadSize(bytes.byteLength);
    return Object.freeze({ tier: 'PARAMETRIC', format: 'BERS_PARAMETRIC_V1', contentType: 'application/vnd.bers.garment-parametric+json',
      contentSha256: sha256(bytes), bytes, sourceViewIds, generatorId, generatorVersion,
      validatorId: PARAMETRIC_VALIDATOR_ID, validatorVersion: PARAMETRIC_VALIDATOR_VERSION });
  }
  if (input.tier === 'FULL_3D') {
    if (!(input.bytes instanceof Uint8Array)) throw httpError(400, 'invalid_garment_representation_glb', 'FULL_3D representation bytes must be a Uint8Array');
    const bytes = new Uint8Array(input.bytes);
    assertPayloadSize(bytes.byteLength);
    validateGlb2(bytes);
    return Object.freeze({ tier: 'FULL_3D', format: 'GLB_2_0', contentType: 'model/gltf-binary', contentSha256: sha256(bytes), bytes,
      sourceViewIds, generatorId, generatorVersion, validatorId: GLB_VALIDATOR_ID, validatorVersion: GLB_VALIDATOR_VERSION });
  }
  throw httpError(400, 'invalid_garment_representation_tier', 'Representation tier is unsupported');
}

function canonicalizeParametricPayload(value: unknown): Uint8Array {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidParametric('PARAMETRIC payload must be an object');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== PARAMETRIC_KEYS.length || !PARAMETRIC_KEYS.every(key => Object.hasOwn(record, key))) throw invalidParametric('PARAMETRIC payload must use the closed BERS_PARAMETRIC_V1 schema');
  if (record.schemaVersion !== 1 || record.coordinateSpace !== 'PRIMARY_VIEW_NORMALIZED') throw invalidParametric('PARAMETRIC payload schemaVersion or coordinateSpace is invalid');
  if (!Array.isArray(record.points) || record.points.length < 3 || record.points.length > MAX_PARAMETRIC_POINTS) throw invalidParametric('PARAMETRIC points must contain 3 to 4096 points');
  const points = record.points.map((candidate, index) => {
    if (!Array.isArray(candidate) || candidate.length !== 2 || !candidate.every(Number.isFinite)) throw invalidParametric(`PARAMETRIC point ${index} is invalid`);
    const x = Number(candidate[0]); const y = Number(candidate[1]);
    if (x < 0 || x > 1 || y < 0 || y > 1) throw invalidParametric(`PARAMETRIC point ${index} escapes normalized coordinates`);
    return Object.freeze([x, y] as const);
  });
  if (!Array.isArray(record.triangles) || record.triangles.length < 1 || record.triangles.length > MAX_PARAMETRIC_TRIANGLES) throw invalidParametric('PARAMETRIC triangles must contain 1 to 8192 triangles');
  const triangles = record.triangles.map((candidate, index) => {
    if (!Array.isArray(candidate) || candidate.length !== 3 || !candidate.every(Number.isSafeInteger)) throw invalidParametric(`PARAMETRIC triangle ${index} is invalid`);
    const [a, b, c] = candidate.map(Number);
    if (a < 0 || b < 0 || c < 0 || a >= points.length || b >= points.length || c >= points.length || a === b || b === c || a === c) throw invalidParametric(`PARAMETRIC triangle ${index} has invalid point references`);
    const area2 = (points[b][0] - points[a][0]) * (points[c][1] - points[a][1]) - (points[b][1] - points[a][1]) * (points[c][0] - points[a][0]);
    if (Math.abs(area2) <= 1e-12) throw invalidParametric(`PARAMETRIC triangle ${index} is degenerate`);
    return Object.freeze([a, b, c] as const);
  });
  if (!Array.isArray(record.outline) || record.outline.length < 3 || record.outline.length > points.length || !record.outline.every(Number.isSafeInteger)) throw invalidParametric('PARAMETRIC outline is invalid');
  const outline = record.outline.map(Number);
  if (new Set(outline).size !== outline.length || outline.some(index => index < 0 || index >= points.length)) throw invalidParametric('PARAMETRIC outline must contain unique valid point references');
  return new TextEncoder().encode(JSON.stringify(Object.freeze({ schemaVersion: 1, coordinateSpace: 'PRIMARY_VIEW_NORMALIZED', points, triangles, outline })));
}

function validateGlb2(bytes: Uint8Array): void {
  if (bytes.byteLength < 28) throw invalidGlb('GLB is too small');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) throw invalidGlb('GLB header is invalid');
  let offset = 12;
  const chunks: Readonly<{ type: number; data: Uint8Array }>[] = [];
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw invalidGlb('GLB chunk header is truncated');
    const length = view.getUint32(offset, true); const type = view.getUint32(offset + 4, true); offset += 8;
    if (length < 1 || offset + length > bytes.byteLength) throw invalidGlb('GLB chunk length is invalid');
    chunks.push(Object.freeze({ type, data: bytes.subarray(offset, offset + length) })); offset += length;
  }
  if (offset !== bytes.byteLength || chunks.length !== 2 || chunks[0].type !== GLB_JSON_CHUNK || chunks[1].type !== GLB_BIN_CHUNK || chunks[1].data.byteLength < 1) throw invalidGlb('GLB must contain exactly one JSON chunk followed by one BIN chunk');
  let json: any;
  try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(chunks[0].data).replace(/[\u0000\u0020]+$/u, '')); }
  catch { throw invalidGlb('GLB JSON chunk is invalid UTF-8 JSON'); }
  if (!json || typeof json !== 'object' || Array.isArray(json) || json.asset?.version !== '2.0') throw invalidGlb('GLB asset.version must be 2.0');
  if (Array.isArray(json.extensionsRequired) && json.extensionsRequired.length > 0) throw invalidGlb('Required GLB extensions are not admitted by F4a');
  if (!Array.isArray(json.buffers) || json.buffers.length !== 1 || json.buffers[0]?.uri !== undefined || !Number.isSafeInteger(json.buffers[0]?.byteLength) || json.buffers[0].byteLength < 1 || json.buffers[0].byteLength > chunks[1].data.byteLength || chunks[1].data.byteLength - json.buffers[0].byteLength > 3) throw invalidGlb('GLB must use one embedded BIN buffer with a valid byteLength');
  if (Array.isArray(json.images) && json.images.some((image: any) => image?.uri !== undefined)) throw invalidGlb('GLB images must not use external or data URIs');
  if (!Array.isArray(json.bufferViews) || json.bufferViews.length < 1 || !Array.isArray(json.accessors) || json.accessors.length < 1) throw invalidGlb('GLB bufferViews and accessors are required');
  const bufferByteLength = Number(json.buffers[0].byteLength);
  for (const [index, bufferView] of json.bufferViews.entries()) {
    const byteOffset = bufferView?.byteOffset === undefined ? 0 : Number(bufferView.byteOffset);
    const byteLength = Number(bufferView?.byteLength);
    const byteStride = bufferView?.byteStride === undefined ? undefined : Number(bufferView.byteStride);
    if (bufferView?.buffer !== 0 || !Number.isSafeInteger(byteOffset) || byteOffset < 0 || !Number.isSafeInteger(byteLength) || byteLength < 1 || byteOffset + byteLength > bufferByteLength || (byteStride !== undefined && (!Number.isSafeInteger(byteStride) || byteStride < 4 || byteStride > 252 || byteStride % 4 !== 0))) throw invalidGlb(`GLB bufferView ${index} escapes the embedded buffer contract`);
  }
  if (!Array.isArray(json.meshes) || json.meshes.length < 1) throw invalidGlb('GLB must contain at least one mesh');
  if (!Array.isArray(json.nodes) || !json.nodes.some((node: any) => Number.isSafeInteger(node?.mesh) && node.mesh >= 0 && node.mesh < json.meshes.length)) throw invalidGlb('GLB must contain a node that references an admitted mesh');
  if (!Array.isArray(json.scenes) || json.scenes.length < 1 || !Number.isSafeInteger(json.scene) || json.scene < 0 || json.scene >= json.scenes.length) throw invalidGlb('GLB must declare a default scene');
  let positionPrimitiveCount = 0;
  for (const mesh of json.meshes) {
    if (!mesh || !Array.isArray(mesh.primitives) || mesh.primitives.length < 1) throw invalidGlb('Every GLB mesh must contain a primitive');
    for (const primitive of mesh.primitives) {
      if (primitive?.mode !== undefined && primitive.mode !== 4) throw invalidGlb('F4a admits triangle-list GLB primitives only');
      const accessorIndex = primitive?.attributes?.POSITION;
      if (!Number.isSafeInteger(accessorIndex) || accessorIndex < 0 || accessorIndex >= json.accessors.length) throw invalidGlb('Every GLB primitive must reference a POSITION accessor');
      const accessor = json.accessors[accessorIndex];
      if (!accessor || accessor.type !== 'VEC3' || accessor.componentType !== 5126 || accessor.sparse !== undefined || accessor.normalized === true || !Number.isSafeInteger(accessor.count) || accessor.count < 3 || !Number.isSafeInteger(accessor.bufferView) || accessor.bufferView < 0 || accessor.bufferView >= json.bufferViews.length) throw invalidGlb('GLB POSITION accessors must be dense float32 VEC3 data with at least three vertices');
      const bufferView = json.bufferViews[accessor.bufferView];
      const accessorByteOffset = accessor.byteOffset === undefined ? 0 : Number(accessor.byteOffset);
      const stride = bufferView.byteStride === undefined ? 12 : Number(bufferView.byteStride);
      if (!Number.isSafeInteger(accessorByteOffset) || accessorByteOffset < 0 || accessorByteOffset % 4 !== 0 || stride < 12 || accessorByteOffset + (accessor.count - 1) * stride + 12 > bufferView.byteLength) throw invalidGlb('GLB POSITION accessor range escapes its bufferView');
      positionPrimitiveCount += 1;
    }
  }
  if (positionPrimitiveCount < 1) throw invalidGlb('GLB has no admitted mesh primitive');
  validateGlbExecutionSubset(bytes, invalidGlb);
}

function normalizeSourceViewIds(value: readonly unknown[]): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) throw httpError(400, 'invalid_garment_representation_sources', 'Representation sourceViewIds must contain 1 to 32 managed view IDs');
  const ids = value.map(candidate => normalizeUuid(candidate, 'invalid_garment_representation_sources', 400));
  if (new Set(ids).size !== ids.length) throw httpError(400, 'invalid_garment_representation_sources', 'Representation sourceViewIds must be unique');
  return Object.freeze(ids);
}
function normalizeProvenance(value: unknown, field: string): string {
  if (typeof value !== 'string') throw httpError(400, 'invalid_garment_representation_provenance', `${field} must be a string`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || [...normalized].length > 100 || /[\u0000-\u001f\u007f]/u.test(normalized)) throw httpError(400, 'invalid_garment_representation_provenance', `${field} must contain 1 to 100 printable characters`);
  return normalized;
}
function assertPayloadSize(byteLength: number): void { if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > MAX_GARMENT_REPRESENTATION_BYTES) throw httpError(413, 'garment_representation_too_large', 'Garment representation exceeds the canonical byte limit'); }
function fromRepresentationRow(row: any): ManagedGarmentRepresentation {
  const sources = Array.isArray(row.sources) ? row.sources.map((source: any) => Object.freeze({ position: Number(source.position), viewId: String(source.viewId).toLowerCase(), contentSha256: String(source.contentSha256) })) : [];
  return Object.freeze({ id: String(row.representation_id).toLowerCase(), garmentId: String(row.garment_id).toLowerCase(), tier: storedRepresentationTier(row.tier), format: storedFormat(row.format), contentType: normalizeStoredContentType(row.content_type), contentSha256: String(row.content_sha256), byteSize: Number(row.byte_size), storageBackend: 'POSTGRES_BYTEA_V1', basisViewId: String(row.basis_view_id).toLowerCase(), generatorId: String(row.generator_id), generatorVersion: String(row.generator_version), validatorId: String(row.validator_id), validatorVersion: String(row.validator_version), admissionState: storedState(row.admission_state), admittedAt: new Date(row.admitted_at).toISOString(), revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null, sources: Object.freeze(sources.sort((a: GarmentRepresentationSource, b: GarmentRepresentationSource) => a.position - b.position)) });
}
function isExactManualParametricReplay(candidate: ManagedGarmentRepresentation, primarySha256: string, contentSha256: string, byteSize: number): boolean {
  return candidate.tier === 'PARAMETRIC'
    && candidate.format === 'BERS_PARAMETRIC_V1'
    && candidate.contentType === 'application/vnd.bers.garment-parametric+json'
    && candidate.contentSha256 === contentSha256
    && candidate.byteSize === byteSize
    && candidate.generatorId === MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID
    && candidate.generatorVersion === MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION
    && candidate.validatorId === PARAMETRIC_VALIDATOR_ID
    && candidate.validatorVersion === PARAMETRIC_VALIDATOR_VERSION
    && candidate.admissionState === 'ADMITTED'
    && candidate.revokedAt === null
    && candidate.sources.length === 1
    && candidate.sources[0].position === 0
    && candidate.sources[0].viewId === candidate.basisViewId
    && candidate.sources[0].contentSha256 === primarySha256;
}
function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}
function storedRepresentationTier(value: unknown): GarmentRepresentationTier { if (value === 'PARAMETRIC' || value === 'FULL_3D') return value; throw new Error('Stored Garment representation tier is invalid'); }
function storedSummaryTier(value: unknown): 'BASIC' | 'PARAMETRIC' | 'FULL_3D' { if (value === 'BASIC' || value === 'PARAMETRIC' || value === 'FULL_3D') return value; throw new Error('Stored Garment representation summary tier is invalid'); }
function storedFormat(value: unknown): GarmentRepresentationFormat { if (value === 'BERS_PARAMETRIC_V1' || value === 'GLB_2_0') return value; throw new Error('Stored Garment representation format is invalid'); }
function storedState(value: unknown): GarmentRepresentationState { if (value === 'ADMITTED' || value === 'REVOKED') return value; throw new Error('Stored Garment representation state is invalid'); }
function normalizeStoredContentType(value: unknown): ManagedGarmentRepresentation['contentType'] { if (value === 'application/vnd.bers.garment-parametric+json' || value === 'model/gltf-binary') return value; throw new Error('Stored Garment representation content type is invalid'); }
function storedGarmentStatus(value: unknown): 'ACTIVE' | 'ARCHIVED' { if (value === 'ACTIVE' || value === 'ARCHIVED') return value; throw new Error('Stored Garment status is invalid'); }
function normalizeUuid(value: unknown, code: string, status: number): string { const candidate = typeof value === 'string' ? value.toLowerCase() : ''; if (!UUID_PATTERN.test(candidate)) throw httpError(status, code, status === 404 ? 'Resource not found' : 'Invalid UUID'); return candidate; }
function isUuid(value: unknown): value is string { return typeof value === 'string' && UUID_PATTERN.test(value); }
function validateExpectedRevision(value: number): void { if (!Number.isSafeInteger(value) || value < 1) throw httpError(400, 'invalid_garment_revision', 'Expected Garment revision is invalid'); }
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function invalidParametric(message: string): Error & { status: number; code: string } { return httpError(400, 'invalid_garment_parametric_representation', message); }
function invalidGlb(message: string): Error & { status: number; code: string } { return httpError(400, 'invalid_garment_glb_representation', message); }
function notFound(): Error & { status: number; code: string } { return httpError(404, 'garment_not_found', 'Garment not found'); }
function representationNotFound(): Error & { status: number; code: string } { return httpError(404, 'garment_representation_not_found', 'Garment representation not found'); }
function revisionConflict(): Error & { status: number; code: string } { return httpError(412, 'garment_revision_conflict', 'Garment revision changed; reload before mutating its representation authority'); }
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
function isConstraintViolation(error: unknown, constraint: string): boolean { return Boolean(error && typeof error === 'object' && (error as any).code === '23505' && (error as any).constraint === constraint); }
