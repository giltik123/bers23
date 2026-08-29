import type { Pool, PoolClient } from 'pg';
import type { GarmentOwnerScope } from './postgresGarmentStore.ts';

export const GARMENT_CATEGORIES = Object.freeze([
  'UNSPECIFIED', 'TOP', 'BOTTOM', 'DRESS', 'OUTERWEAR', 'FOOTWEAR', 'ACCESSORY', 'OTHER',
] as const);
export const GARMENT_SEASONS = Object.freeze(['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const);
export type GarmentCategory = typeof GARMENT_CATEGORIES[number];
export type GarmentSeason = typeof GARMENT_SEASONS[number];

export type ManagedGarmentWardrobe = Readonly<{
  garmentId: string;
  name: string;
  category: GarmentCategory;
  seasons: readonly GarmentSeason[];
  materials: readonly string[];
  tags: readonly string[];
  favorite: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
  revision: number;
  updatedAt: string;
}>;

export type GarmentWardrobePatch = Readonly<{
  name?: unknown;
  category?: unknown;
  seasons?: unknown;
  materials?: unknown;
  tags?: unknown;
  favorite?: unknown;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATCH_KEYS = new Set(['name', 'category', 'seasons', 'materials', 'tags', 'favorite']);
const MAX_MATERIALS = 12;
const MAX_TAGS = 20;

export class PostgresGarmentWardrobeStore {
  constructor(private readonly pool: Pool) {}

  async list(scope: GarmentOwnerScope): Promise<readonly ManagedGarmentWardrobe[]> {
    const result = await this.pool.query(`${WARDROBE_SELECT}
      WHERE g.tenant_id=$1 AND g.user_id=$2 AND g.deleted_at IS NULL
      ORDER BY g.updated_at DESC, g.garment_id`, [scope.tenantId, scope.userId]);
    return Object.freeze(result.rows.map(fromRow));
  }

  async get(scope: GarmentOwnerScope, garmentId: string): Promise<ManagedGarmentWardrobe | undefined> {
    if (!isUuid(garmentId)) return undefined;
    const result = await this.pool.query(`${WARDROBE_SELECT}
      WHERE g.garment_id=$1 AND g.tenant_id=$2 AND g.user_id=$3 AND g.deleted_at IS NULL`,
    [garmentId, scope.tenantId, scope.userId]);
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }

  async updateMetadata(
    scope: GarmentOwnerScope,
    garmentId: string,
    expectedRevision: number,
    rawPatch: unknown,
  ): Promise<ManagedGarmentWardrobe> {
    validateMutationIdentity(garmentId, expectedRevision);
    const patch = normalizePatch(rawPatch);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedMetadata(client, scope, garmentId);
      if (!current) throw notFound();
      if (current.revision !== expectedRevision) throw revisionConflict();

      const next = Object.freeze({
        ...current,
        name: patch.name ?? current.name,
        category: patch.category ?? current.category,
        seasons: patch.seasons ?? current.seasons,
        materials: patch.materials ?? current.materials,
        tags: patch.tags ?? current.tags,
        favorite: patch.favorite ?? current.favorite,
      });
      if (metadataEqual(current, next)) {
        await client.query('COMMIT');
        return current;
      }

      const updated = await client.query(`UPDATE canonical_garments
        SET name=$4, category=$5, favorite=$6, revision=revision+1, updated_at=CURRENT_TIMESTAMP
        WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND revision=$7
        RETURNING revision`,
      [garmentId, scope.tenantId, scope.userId, next.name, next.category, next.favorite, expectedRevision]);
      if (updated.rowCount !== 1 || Number(updated.rows[0]?.revision) !== expectedRevision + 1) throw revisionConflict();

      if (patch.seasons) await replaceValues(client, 'canonical_garment_seasons', 'season', scope, garmentId, patch.seasons);
      if (patch.materials) await replaceValues(client, 'canonical_garment_materials', 'material', scope, garmentId, patch.materials);
      if (patch.tags) await replaceValues(client, 'canonical_garment_tags', 'tag', scope, garmentId, patch.tags);

      const snapshot = await selectMetadata(client, scope, garmentId);
      if (!snapshot || snapshot.revision !== expectedRevision + 1) {
        throw new Error('Managed Garment wardrobe mutation did not produce its expected revision');
      }
      await client.query('COMMIT');
      return snapshot;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async archive(scope: GarmentOwnerScope, garmentId: string, expectedRevision: number): Promise<ManagedGarmentWardrobe> {
    return this.setStatus(scope, garmentId, expectedRevision, 'ARCHIVED');
  }

  async restore(scope: GarmentOwnerScope, garmentId: string, expectedRevision: number): Promise<ManagedGarmentWardrobe> {
    return this.setStatus(scope, garmentId, expectedRevision, 'ACTIVE');
  }

  async delete(scope: GarmentOwnerScope, garmentId: string, expectedRevision: number): Promise<number> {
    validateMutationIdentity(garmentId, expectedRevision);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedMetadata(client, scope, garmentId);
      if (!current) throw notFound();
      if (current.revision !== expectedRevision) throw revisionConflict();
      const updated = await client.query(`UPDATE canonical_garments
        SET status='ARCHIVED', revision=revision+1, updated_at=CURRENT_TIMESTAMP, deleted_at=CURRENT_TIMESTAMP
        WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND revision=$4
        RETURNING revision`, [garmentId, scope.tenantId, scope.userId, expectedRevision]);
      const revision = Number(updated.rows[0]?.revision);
      if (updated.rowCount !== 1 || revision !== expectedRevision + 1) throw revisionConflict();
      await client.query('COMMIT');
      return revision;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async setStatus(
    scope: GarmentOwnerScope,
    garmentId: string,
    expectedRevision: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ): Promise<ManagedGarmentWardrobe> {
    validateMutationIdentity(garmentId, expectedRevision);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedMetadata(client, scope, garmentId);
      if (!current) throw notFound();
      if (current.revision !== expectedRevision) throw revisionConflict();
      if (current.status === status) {
        await client.query('COMMIT');
        return current;
      }
      const updated = await client.query(`UPDATE canonical_garments
        SET status=$4, revision=revision+1, updated_at=CURRENT_TIMESTAMP
        WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND revision=$5
        RETURNING revision`, [garmentId, scope.tenantId, scope.userId, status, expectedRevision]);
      if (updated.rowCount !== 1 || Number(updated.rows[0]?.revision) !== expectedRevision + 1) throw revisionConflict();
      const snapshot = await selectMetadata(client, scope, garmentId);
      if (!snapshot || snapshot.revision !== expectedRevision + 1 || snapshot.status !== status) {
        throw new Error('Managed Garment lifecycle mutation did not produce its expected state');
      }
      await client.query('COMMIT');
      return snapshot;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

const WARDROBE_SELECT = `SELECT
  g.garment_id,g.name,g.category,g.favorite,g.status,g.revision,g.updated_at,
  COALESCE((SELECT jsonb_agg(s.season ORDER BY s.season) FROM canonical_garment_seasons s
    WHERE s.garment_id=g.garment_id AND s.tenant_id=g.tenant_id AND s.user_id=g.user_id), '[]'::jsonb) AS seasons,
  COALESCE((SELECT jsonb_agg(m.material ORDER BY m.material) FROM canonical_garment_materials m
    WHERE m.garment_id=g.garment_id AND m.tenant_id=g.tenant_id AND m.user_id=g.user_id), '[]'::jsonb) AS materials,
  COALESCE((SELECT jsonb_agg(t.tag ORDER BY t.tag) FROM canonical_garment_tags t
    WHERE t.garment_id=g.garment_id AND t.tenant_id=g.tenant_id AND t.user_id=g.user_id), '[]'::jsonb) AS tags
  FROM canonical_garments g`;

async function lockedMetadata(client: PoolClient, scope: GarmentOwnerScope, garmentId: string): Promise<ManagedGarmentWardrobe | undefined> {
  const lock = await client.query(`SELECT garment_id FROM canonical_garments
    WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL FOR UPDATE`,
  [garmentId, scope.tenantId, scope.userId]);
  if (!lock.rows[0]) return undefined;
  return selectMetadata(client, scope, garmentId);
}

async function selectMetadata(client: PoolClient, scope: GarmentOwnerScope, garmentId: string): Promise<ManagedGarmentWardrobe | undefined> {
  const result = await client.query(`${WARDROBE_SELECT}
    WHERE g.garment_id=$1 AND g.tenant_id=$2 AND g.user_id=$3 AND g.deleted_at IS NULL`,
  [garmentId, scope.tenantId, scope.userId]);
  return result.rows[0] ? fromRow(result.rows[0]) : undefined;
}

async function replaceValues(
  client: PoolClient,
  table: 'canonical_garment_seasons' | 'canonical_garment_materials' | 'canonical_garment_tags',
  column: 'season' | 'material' | 'tag',
  scope: GarmentOwnerScope,
  garmentId: string,
  values: readonly string[],
): Promise<void> {
  await client.query(`DELETE FROM ${table} WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3`,
  [garmentId, scope.tenantId, scope.userId]);
  for (const value of values) {
    await client.query(`INSERT INTO ${table} (garment_id,tenant_id,user_id,${column}) VALUES ($1,$2,$3,$4)`,
    [garmentId, scope.tenantId, scope.userId, value]);
  }
}

function normalizePatch(value: unknown): Readonly<{
  name?: string;
  category?: GarmentCategory;
  seasons?: readonly GarmentSeason[];
  materials?: readonly string[];
  tags?: readonly string[];
  favorite?: boolean;
}> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'invalid_wardrobe_patch', 'Wardrobe metadata patch must be a JSON object');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.some(key => !PATCH_KEYS.has(key))) {
    throw httpError(400, 'invalid_wardrobe_patch', 'Wardrobe metadata patch contains no supported fields or includes unknown fields');
  }
  return Object.freeze({
    ...(Object.hasOwn(record, 'name') ? { name: normalizeName(record.name) } : {}),
    ...(Object.hasOwn(record, 'category') ? { category: normalizeCategory(record.category) } : {}),
    ...(Object.hasOwn(record, 'seasons') ? { seasons: normalizeSeasons(record.seasons) } : {}),
    ...(Object.hasOwn(record, 'materials') ? { materials: normalizeTokenArray(record.materials, 'material', MAX_MATERIALS, 50) } : {}),
    ...(Object.hasOwn(record, 'tags') ? { tags: normalizeTokenArray(record.tags, 'tag', MAX_TAGS, 40) } : {}),
    ...(Object.hasOwn(record, 'favorite') ? { favorite: normalizeFavorite(record.favorite) } : {}),
  });
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') throw httpError(400, 'invalid_garment_name', 'Garment name must be a string');
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!name || name.length > 200 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw httpError(400, 'invalid_garment_name', 'Garment name must contain 1 to 200 printable characters');
  }
  return name;
}

function normalizeCategory(value: unknown): GarmentCategory {
  const category = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!(GARMENT_CATEGORIES as readonly string[]).includes(category)) {
    throw httpError(400, 'invalid_garment_category', 'Garment category is unsupported');
  }
  return category as GarmentCategory;
}

function normalizeSeasons(value: unknown): readonly GarmentSeason[] {
  if (!Array.isArray(value)) throw httpError(400, 'invalid_garment_seasons', 'Garment seasons must be an array');
  const set = new Set<GarmentSeason>();
  for (const candidate of value) {
    const season = typeof candidate === 'string' ? candidate.trim().toUpperCase() : '';
    if (!(GARMENT_SEASONS as readonly string[]).includes(season)) {
      throw httpError(400, 'invalid_garment_seasons', 'Garment seasons contain an unsupported value');
    }
    set.add(season as GarmentSeason);
  }
  return Object.freeze(GARMENT_SEASONS.filter(season => set.has(season)));
}

function normalizeTokenArray(value: unknown, field: string, maxCount: number, maxLength: number): readonly string[] {
  if (!Array.isArray(value) || value.length > maxCount) {
    throw httpError(400, `invalid_garment_${field}s`, `Garment ${field}s must be an array with at most ${maxCount} values`);
  }
  const set = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== 'string') throw httpError(400, `invalid_garment_${field}s`, `Every garment ${field} must be a string`);
    const normalized = candidate.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
    if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/u.test(normalized)) {
      throw httpError(400, `invalid_garment_${field}s`, `Garment ${field} values must contain 1 to ${maxLength} printable characters`);
    }
    set.add(normalized);
  }
  if (set.size > maxCount) throw httpError(400, `invalid_garment_${field}s`, `Too many distinct garment ${field} values`);
  return Object.freeze([...set].sort());
}

function normalizeFavorite(value: unknown): boolean {
  if (typeof value !== 'boolean') throw httpError(400, 'invalid_garment_favorite', 'Garment favorite must be boolean');
  return value;
}

function fromRow(row: any): ManagedGarmentWardrobe {
  const status = storedStatus(row.status);
  const category = storedCategory(row.category);
  const favorite = row.favorite;
  const revision = Number(row.revision);
  if (typeof favorite !== 'boolean') throw new Error('Stored Garment favorite is invalid');
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Stored Garment revision is invalid');
  return Object.freeze({
    garmentId: String(row.garment_id),
    name: String(row.name),
    category,
    seasons: Object.freeze((Array.isArray(row.seasons) ? row.seasons : []).map(normalizeStoredSeason)),
    materials: Object.freeze((Array.isArray(row.materials) ? row.materials : []).map(String)),
    tags: Object.freeze((Array.isArray(row.tags) ? row.tags : []).map(String)),
    favorite,
    status,
    revision,
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

function storedCategory(value: unknown): GarmentCategory {
  const category = String(value);
  if (!(GARMENT_CATEGORIES as readonly string[]).includes(category)) throw new Error('Stored Garment category is unsupported');
  return category as GarmentCategory;
}
function storedStatus(value: unknown): 'ACTIVE' | 'ARCHIVED' {
  if (value !== 'ACTIVE' && value !== 'ARCHIVED') throw new Error('Stored Garment status is unsupported');
  return value;
}
function normalizeStoredSeason(value: unknown): GarmentSeason {
  const season = String(value);
  if (!(GARMENT_SEASONS as readonly string[]).includes(season)) throw new Error('Stored Garment season is unsupported');
  return season as GarmentSeason;
}

function metadataEqual(left: ManagedGarmentWardrobe, right: ManagedGarmentWardrobe): boolean {
  return left.name === right.name
    && left.category === right.category
    && left.favorite === right.favorite
    && left.status === right.status
    && arrayEqual(left.seasons, right.seasons)
    && arrayEqual(left.materials, right.materials)
    && arrayEqual(left.tags, right.tags);
}
function arrayEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function validateMutationIdentity(garmentId: string, expectedRevision: number): void {
  if (!isUuid(garmentId)) throw notFound();
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw httpError(400, 'invalid_garment_revision', 'Expected garment revision is invalid');
}
function isUuid(value: unknown): value is string { return typeof value === 'string' && UUID_PATTERN.test(value); }
function notFound(): Error & { status: number; code: string } { return httpError(404, 'garment_not_found', 'Garment not found'); }
function revisionConflict(): Error & { status: number; code: string } {
  return httpError(412, 'garment_revision_conflict', 'Garment revision changed; reload the aggregate before changing wardrobe metadata');
}
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
