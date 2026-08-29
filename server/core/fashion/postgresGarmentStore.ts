import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Pool } from 'pg';

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

type CreateGarmentInput = Readonly<{
  name: string;
  viewKind: GarmentViewKind;
  sourceContentType: 'image/png' | 'image/jpeg' | 'image/webp';
  bytes: Uint8Array;
}>;

export class PostgresGarmentStore {
  constructor(private readonly pool: Pool, private readonly nextId: () => string = randomUUID) {}

  async createWithInitialView(scope: GarmentOwnerScope, input: CreateGarmentInput, limits: GarmentImageLimits): Promise<ManagedGarment> {
    const name = normalizeName(input.name);
    const viewKind = normalizeViewKind(input.viewKind);
    const sourceContentType = normalizeSourceContentType(input.sourceContentType);
    if (!input.bytes.byteLength) throw httpError(400, 'empty_garment_image', 'Garment image body is required');
    if (input.bytes.byteLength > limits.maxUploadBytes) throw httpError(413, 'garment_image_too_large', 'Garment image exceeds the configured upload limit');

    let normalized: Awaited<ReturnType<ReturnType<typeof sharp>['raw']>['toBuffer']>;
    try {
      normalized = await sharp(input.bytes, { failOn: 'error', limitInputPixels: limits.maxPixels })
        .rotate()
        .toColourspace('srgb')
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    } catch {
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
    const contentSha256 = createHash('sha256').update(png).digest('hex');
    const garmentId = this.nextId();
    const viewId = this.nextId();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO canonical_garments
        (garment_id,tenant_id,user_id,name,representation_tier,status,revision)
        VALUES ($1,$2,$3,$4,'BASIC','ACTIVE',1)`, [garmentId, scope.tenantId, scope.userId, name]);
      await client.query(`INSERT INTO canonical_garment_views
        (view_id,garment_id,tenant_id,user_id,ordinal,view_kind,source_content_type,width,height,encoding,content_type,content_sha256,image_bytes)
        VALUES ($1,$2,$3,$4,0,$5,$6,$7,$8,'PNG_RGBA8_LOSSLESS','image/png',$9,$10)`,
      [viewId, garmentId, scope.tenantId, scope.userId, viewKind, sourceContentType, width, height, contentSha256, png]);
      await client.query(`UPDATE canonical_garments SET primary_view_id=$2,updated_at=CURRENT_TIMESTAMP
        WHERE garment_id=$1 AND tenant_id=$3 AND user_id=$4`, [garmentId, viewId, scope.tenantId, scope.userId]);
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

  async list(scope: GarmentOwnerScope): Promise<readonly ManagedGarment[]> {
    const result = await this.pool.query(`${GARMENT_SELECT}
      WHERE g.tenant_id=$1 AND g.user_id=$2 AND g.deleted_at IS NULL
      ORDER BY g.updated_at DESC, g.garment_id`, [scope.tenantId, scope.userId]);
    return result.rows.map(fromGarmentRow);
  }

  async get(scope: GarmentOwnerScope, garmentId: string): Promise<ManagedGarment | undefined> {
    if (!garmentId) return undefined;
    const result = await this.pool.query(`${GARMENT_SELECT}
      WHERE g.garment_id=$1 AND g.tenant_id=$2 AND g.user_id=$3 AND g.deleted_at IS NULL`,
    [garmentId, scope.tenantId, scope.userId]);
    return result.rows[0] ? fromGarmentRow(result.rows[0]) : undefined;
  }

  async loadView(scope: GarmentOwnerScope, garmentId: string, viewId: string): Promise<Readonly<{ bytes: Uint8Array; contentType: 'image/png'; contentSha256: string }> | undefined> {
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
    'createdAt',v.created_at
  ) ORDER BY v.ordinal)
  FROM canonical_garment_views v
  WHERE v.garment_id=g.garment_id AND v.tenant_id=g.tenant_id AND v.user_id=g.user_id
    AND v.revoked_at IS NULL AND v.deleted_at IS NULL), '[]'::jsonb) AS views
  FROM canonical_garments g`;

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
    createdAt: new Date(view.createdAt).toISOString(),
  }));
  const primaryViewId = String(row.primary_view_id ?? '');
  if (!primaryViewId || views.length !== 1 || views[0]?.id !== primaryViewId) {
    throw new Error('Managed garment initial-view invariant is violated');
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

function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
