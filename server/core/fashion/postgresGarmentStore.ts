import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Pool, PoolClient } from 'pg';

export const GARMENT_VIEW_KINDS = Object.freeze(['UNSPECIFIED', 'FRONT', 'BACK', 'LEFT', 'RIGHT', 'DETAIL'] as const);
export type GarmentViewKind = typeof GARMENT_VIEW_KINDS[number];
export type GarmentOwnerScope = Readonly<{ tenantId: string; userId: string }>;
export type GarmentImageLimits = Readonly<{ maxUploadBytes: number; maxDimension: number; maxPixels: number }>;

export type ManagedGarmentView = Readonly<{
  id: string;
  ordinal: number;
  kind: GarmentViewKind;
  sourceContentType: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  encoding: 'PNG_RGBA8_LOSSLESS';
  contentType: 'image/png';
  contentSha256: string;
  storageBackend: 'POSTGRES_BYTEA_V1';
  createdAt: string;
}>;

export type ManagedGarment = Readonly<{
  id: string;
  name: string;
  representationTier: 'BASIC' | 'PARAMETRIC' | 'FULL_3D';
  status: 'ACTIVE' | 'ARCHIVED';
  revision: number;
  primaryViewId: string;
  views: readonly ManagedGarmentView[];
  createdAt: string;
  updatedAt: string;
}>;

type GarmentImageInput = Readonly<{
  viewKind: GarmentViewKind;
  sourceContentType: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: Uint8Array;
}>;

type CreateGarmentInput = GarmentImageInput & Readonly<{ name: string }>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PostgresGarmentStore {
  constructor(private readonly pool: Pool, private readonly nextId: () => string = randomUUID) {}

  async createWithInitialView(
    scope: GarmentOwnerScope,
    input: CreateGarmentInput,
    limits: GarmentImageLimits,
  ): Promise<ManagedGarment> {
    const name = normalizeName(input.name);
    const normalized = await normalizeGarmentImage(input, limits);
    const garmentId = this.nextId();
    const viewId = this.nextId();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO canonical_garments
        (garment_id,tenant_id,user_id,name,representation_tier,status,revision,primary_view_id)
        VALUES ($1,$2,$3,$4,'BASIC','ACTIVE',1,$5)`, [garmentId, scope.tenantId, scope.userId, name, viewId]);
      await insertManagedView(client, scope, garmentId, viewId, 0, normalized);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const created = await this.get(scope, garmentId);
    if (!created) throw new Error('Managed garment creation committed but could not be reloaded');
    return created;
  }

  async appendView(
    scope: GarmentOwnerScope,
    garmentId: string,
    expectedRevision: number,
    input: GarmentImageInput,
    limits: GarmentImageLimits,
  ): Promise<ManagedGarment> {
    if (!isUuid(garmentId)) throw httpError(404, 'garment_not_found', 'Garment not found');
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw httpError(400, 'invalid_garment_revision', 'Expected garment revision is invalid');
    }

    const preflight = await this.pool.query(`SELECT revision,status FROM canonical_garments
      WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL`,
    [garmentId, scope.tenantId, scope.userId]);
    if (!preflight.rows[0]) throw httpError(404, 'garment_not_found', 'Garment not found');
    if (String(preflight.rows[0].status) !== 'ACTIVE') throw garmentNotActive();
    if (Number(preflight.rows[0].revision) !== expectedRevision) throw revisionConflict();

    const normalized = await normalizeGarmentImage(input, limits);
    const viewId = this.nextId();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const locked = await client.query(`SELECT revision,status FROM canonical_garments
        WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL
        FOR UPDATE`, [garmentId, scope.tenantId, scope.userId]);
      if (!locked.rows[0]) throw httpError(404, 'garment_not_found', 'Garment not found');
      if (String(locked.rows[0].status) !== 'ACTIVE') throw garmentNotActive();
      if (Number(locked.rows[0].revision) !== expectedRevision) throw revisionConflict();

      const ordinalResult = await client.query(`SELECT COALESCE(MAX(ordinal), -1) + 1 AS ordinal
        FROM canonical_garment_views
        WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3`,
      [garmentId, scope.tenantId, scope.userId]);
      const ordinal = Number(ordinalResult.rows[0]?.ordinal);
      if (!Number.isSafeInteger(ordinal) || ordinal < 1) {
        throw new Error('Managed garment next-view ordinal is invalid');
      }

      await insertManagedView(client, scope, garmentId, viewId, ordinal, normalized);
      const updated = await client.query(`UPDATE canonical_garments
        SET revision=revision+1, updated_at=CURRENT_TIMESTAMP
        WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND status='ACTIVE' AND revision=$4
        RETURNING revision`, [garmentId, scope.tenantId, scope.userId, expectedRevision]);
      if (updated.rowCount !== 1) throw revisionConflict();
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const updated = await this.get(scope, garmentId);
    if (!updated) throw new Error('Managed garment view append committed but aggregate could not be reloaded');
    return updated;
  }

  async list(scope: GarmentOwnerScope): Promise<readonly ManagedGarment[]> {
    const result = await this.pool.query(`${GARMENT_SELECT}
      WHERE g.tenant_id=$1 AND g.user_id=$2 AND g.deleted_at IS NULL
      ORDER BY g.updated_at DESC, g.garment_id`, [scope.tenantId, scope.userId]);
    return result.rows.map(fromGarmentRow);
  }

  async get(scope: GarmentOwnerScope, garmentId: string): Promise<ManagedGarment | undefined> {
    if (!isUuid(garmentId)) return undefined;
    const result = await this.pool.query(`${GARMENT_SELECT}
      WHERE g.garment_id=$1 AND g.tenant_id=$2 AND g.user_id=$3 AND g.deleted_at IS NULL`,
    [garmentId, scope.tenantId, scope.userId]);
    return result.rows[0] ? fromGarmentRow(result.rows[0]) : undefined;
  }

  async loadView(
    scope: GarmentOwnerScope,
    garmentId: string,
    viewId: string,
  ): Promise<Readonly<{ bytes: Uint8Array; contentType: 'image/png'; contentSha256: string }> | undefined> {
    if (!isUuid(garmentId) || !isUuid(viewId)) return undefined;
    const result = await this.pool.query(`SELECT v.image_bytes,v.content_type,v.content_sha256
      FROM canonical_garment_views v
      JOIN canonical_garments g ON g.garment_id=v.garment_id AND g.tenant_id=v.tenant_id AND g.user_id=v.user_id
      WHERE v.view_id=$1 AND v.garment_id=$2 AND v.tenant_id=$3 AND v.user_id=$4
        AND v.revoked_at IS NULL AND v.deleted_at IS NULL AND g.deleted_at IS NULL`,
    [viewId, garmentId, scope.tenantId, scope.userId]);
    const row = result.rows[0];
    if (!row) return undefined;
    return Object.freeze({ bytes: new Uint8Array(row.image_bytes), contentType: 'image/png' as const, contentSha256: String(row.content_sha256) });
  }
}

const GARMENT_SELECT = `SELECT g.*,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',v.view_id,
    'ordinal',v.ordinal,
    'kind',v.view_kind,
    'sourceContentType',v.source_content_type,
    'width',v.width,
    'height',v.height,
    'encoding',v.encoding,
    'contentType',v.content_type,
    'contentSha256',v.content_sha256,
    'storageBackend',v.storage_backend,
    'createdAt',v.created_at
  ) ORDER BY v.ordinal)
  FROM canonical_garment_views v
  WHERE v.garment_id=g.garment_id AND v.tenant_id=g.tenant_id AND v.user_id=g.user_id
    AND v.revoked_at IS NULL AND v.deleted_at IS NULL), '[]'::jsonb) AS views
  FROM canonical_garments g`;

type NormalizedGarmentImage = Readonly<{
  viewKind: GarmentViewKind;
  sourceContentType: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  contentSha256: string;
  png: Buffer;
}>;

async function normalizeGarmentImage(input: GarmentImageInput, limits: GarmentImageLimits): Promise<NormalizedGarmentImage> {
  const viewKind = normalizeViewKind(input.viewKind);
  const sourceContentType = normalizeSourceContentType(input.sourceContentType);
  if (!input.bytes.byteLength) throw httpError(400, 'empty_garment_image', 'Garment image body is required');
  if (input.bytes.byteLength > limits.maxUploadBytes) {
    throw httpError(413, 'garment_image_too_large', 'Garment image exceeds the configured upload limit');
  }

  let normalized: { data: Buffer; info: { width: number; height: number } };
  try {
    const decoder = sharp(input.bytes, { failOn: 'error', limitInputPixels: limits.maxPixels });
    const metadata = await decoder.metadata();
    const decodedContentType = decodedImageContentType(metadata.format);
    if (decodedContentType !== sourceContentType) {
      throw httpError(415, 'garment_image_media_type_mismatch', 'Garment Content-Type does not match the decoded image format');
    }
    if ((metadata.pages ?? 1) !== 1) {
      throw httpError(400, 'animated_garment_image_unsupported', 'Animated or multi-page garment images are not supported');
    }
    normalized = await decoder
      .rotate()
      .toColourspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (isHttpError(error)) throw error;
    throw httpError(400, 'invalid_garment_image', 'Garment image is malformed or unsafe');
  }

  const width = Number(normalized.info.width);
  const height = Number(normalized.info.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > limits.maxDimension || height > limits.maxDimension || width * height > limits.maxPixels) {
    throw httpError(400, 'invalid_garment_image_dimensions', 'Garment image dimensions are unsafe');
  }

  const png = await sharp(normalized.data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  if (png.byteLength > limits.maxUploadBytes) {
    throw httpError(413, 'normalized_garment_image_too_large', 'Canonical garment image exceeds the configured storage limit');
  }
  return Object.freeze({
    viewKind,
    sourceContentType,
    width,
    height,
    contentSha256: createHash('sha256').update(png).digest('hex'),
    png,
  });
}

async function insertManagedView(
  client: PoolClient,
  scope: GarmentOwnerScope,
  garmentId: string,
  viewId: string,
  ordinal: number,
  image: NormalizedGarmentImage,
): Promise<void> {
  await client.query(`INSERT INTO canonical_garment_views
    (view_id,garment_id,tenant_id,user_id,ordinal,view_kind,source_content_type,width,height,encoding,content_type,content_sha256,storage_backend,image_bytes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PNG_RGBA8_LOSSLESS','image/png',$10,'POSTGRES_BYTEA_V1',$11)`,
  [viewId, garmentId, scope.tenantId, scope.userId, ordinal, image.viewKind, image.sourceContentType, image.width, image.height, image.contentSha256, image.png]);
}

function fromGarmentRow(row: any): ManagedGarment {
  const views = (Array.isArray(row.views) ? row.views : []).map((view: any) => Object.freeze({
    id: String(view.id),
    ordinal: Number(view.ordinal),
    kind: normalizeViewKind(view.kind),
    sourceContentType: normalizeSourceContentType(view.sourceContentType),
    width: Number(view.width),
    height: Number(view.height),
    encoding: 'PNG_RGBA8_LOSSLESS' as const,
    contentType: 'image/png' as const,
    contentSha256: String(view.contentSha256),
    storageBackend: normalizeStorageBackend(view.storageBackend),
    createdAt: new Date(view.createdAt).toISOString(),
  }));
  const primaryViewId = String(row.primary_view_id ?? '');
  if (!primaryViewId || views.length < 1 || !views.some((view) => view.id === primaryViewId)) {
    throw new Error('Managed garment primary-view invariant is violated');
  }
  return Object.freeze({
    id: String(row.garment_id),
    name: String(row.name),
    representationTier: row.representation_tier,
    status: row.status,
    revision: Number(row.revision),
    primaryViewId,
    views: Object.freeze(views),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

function garmentNotActive(): Error & { status: number; code: string } {
  return httpError(409, 'garment_not_active', 'Archived garments cannot accept additional views');
}
function revisionConflict(): Error & { status: number; code: string } {
  return httpError(412, 'garment_revision_conflict', 'Garment revision changed; reload the aggregate before appending another view');
}
function isUuid(value: unknown): value is string { return typeof value === 'string' && UUID_PATTERN.test(value); }
function normalizeName(value: string): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 200) throw httpError(400, 'invalid_garment_name', 'Garment name must contain 1 to 200 characters');
  return name;
}
function normalizeViewKind(value: unknown): GarmentViewKind {
  const kind = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!(GARMENT_VIEW_KINDS as readonly string[]).includes(kind)) throw httpError(400, 'invalid_garment_view_kind', 'Garment view kind is unsupported');
  return kind as GarmentViewKind;
}
function normalizeSourceContentType(value: unknown): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (value === 'image/png' || value === 'image/jpeg' || value === 'image/webp') return value;
  throw httpError(415, 'unsupported_media_type', 'Supported garment images are PNG, JPEG and WebP');
}
function decodedImageContentType(format: unknown): 'image/png' | 'image/jpeg' | 'image/webp' {
  if (format === 'png') return 'image/png';
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  throw httpError(415, 'unsupported_media_type', 'Decoded garment image format is unsupported');
}
function normalizeStorageBackend(value: unknown): 'POSTGRES_BYTEA_V1' {
  if (value === 'POSTGRES_BYTEA_V1') return value;
  throw new Error('Managed garment storage provenance is unsupported');
}
function isHttpError(value: unknown): value is Error & { status: number; code: string } {
  return Boolean(value && typeof value === 'object' && Number.isInteger((value as any).status) && typeof (value as any).code === 'string');
}
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
