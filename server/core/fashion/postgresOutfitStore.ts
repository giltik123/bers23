import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { GarmentOwnerScope } from './postgresGarmentStore.ts';
import { GARMENT_CATEGORIES, type GarmentCategory } from './postgresGarmentWardrobeStore.ts';

export const OUTFIT_STYLES = Object.freeze([
  'minimal','classic','elegant','streetwear','business','luxury','sport','vintage','casual','modern','creative','smart_casual',
] as const);
export const OUTFIT_SEASONS = Object.freeze(['all_season','spring','summer','autumn','winter'] as const);
export const OUTFIT_OCCASIONS = Object.freeze([
  'casual','business','formal','wedding','party','travel','sport','outdoor','streetwear','luxury','home','beach','night_out',
] as const);
export const OUTFIT_LAYER_ROLES = Object.freeze([
  'BASE_TOP','MID_TOP','OUTER_TOP','FULL_BODY','BOTTOM','FOOTWEAR','ACCESSORY',
] as const);

export type OutfitStyle = typeof OUTFIT_STYLES[number];
export type OutfitSeason = typeof OUTFIT_SEASONS[number];
export type OutfitOccasion = typeof OUTFIT_OCCASIONS[number];
export type OutfitLayerRole = typeof OUTFIT_LAYER_ROLES[number];
export type OutfitStatus = 'ACTIVE' | 'ARCHIVED';
export type OutfitEntryReferenceReadiness = 'READY' | 'GARMENT_UNAVAILABLE' | 'ROLE_REVIEW_REQUIRED';
export type OutfitReferenceReadiness = 'REFERENCES_READY' | 'EMPTY' | 'GARMENT_UNAVAILABLE' | 'ROLE_REVIEW_REQUIRED';

export type ManagedOutfitEntry = Readonly<{
  entryId: string;
  garmentId: string;
  position: number;
  layerRole: OutfitLayerRole;
  garmentCategory?: GarmentCategory;
  referenceReadiness: OutfitEntryReferenceReadiness;
}>;

export type ManagedOutfit = Readonly<{
  id: string;
  name: string;
  style: OutfitStyle;
  season: OutfitSeason;
  occasion: OutfitOccasion;
  favorite: boolean;
  status: OutfitStatus;
  revision: number;
  entries: readonly ManagedOutfitEntry[];
  referenceReadiness: OutfitReferenceReadiness;
  createdAt: string;
  updatedAt: string;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATCH_KEYS = new Set(['name','style','season','occasion','favorite']);
const MAX_ENTRIES = 32;

const CATEGORY_ROLES: Readonly<Record<GarmentCategory, readonly OutfitLayerRole[]>> = Object.freeze({
  tshirts: Object.freeze(['BASE_TOP']),
  shirts: Object.freeze(['BASE_TOP','MID_TOP']),
  jackets: Object.freeze(['OUTER_TOP']),
  hoodies: Object.freeze(['MID_TOP','OUTER_TOP']),
  sweaters: Object.freeze(['MID_TOP']),
  pants: Object.freeze(['BOTTOM']), shorts: Object.freeze(['BOTTOM']), jeans: Object.freeze(['BOTTOM']), skirts: Object.freeze(['BOTTOM']),
  dresses: Object.freeze(['FULL_BODY']),
  shoes: Object.freeze(['FOOTWEAR']), boots: Object.freeze(['FOOTWEAR']), sneakers: Object.freeze(['FOOTWEAR']), sandals: Object.freeze(['FOOTWEAR']),
  hats: Object.freeze(['ACCESSORY']), glasses: Object.freeze(['ACCESSORY']), scarves: Object.freeze(['ACCESSORY']), bags: Object.freeze(['ACCESSORY']),
  belts: Object.freeze(['ACCESSORY']), jewelry: Object.freeze(['ACCESSORY']), gloves: Object.freeze(['ACCESSORY']), socks: Object.freeze(['ACCESSORY']),
  other: Object.freeze(['ACCESSORY']),
});

export function allowedOutfitLayerRoles(category: GarmentCategory): readonly OutfitLayerRole[] {
  return CATEGORY_ROLES[category];
}

export function defaultOutfitLayerRole(category: GarmentCategory): OutfitLayerRole {
  return CATEGORY_ROLES[category][0];
}

export class PostgresOutfitStore {
  constructor(private readonly pool: Pool, private readonly nextId: () => string = randomUUID) {}

  async create(
    scope: GarmentOwnerScope,
    input: Readonly<{ name: unknown; style?: unknown; season?: unknown; occasion?: unknown; favorite?: unknown }>,
  ): Promise<ManagedOutfit> {
    const outfitId = requireGeneratedId(this.nextId(), 'Outfit');
    const metadata = normalizeCreate(input);
    const inserted = await this.pool.query(`INSERT INTO canonical_outfits
      (outfit_id,tenant_id,user_id,name,style,season,occasion,favorite,status,revision)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE',1)
      RETURNING outfit_id`, [
      outfitId, scope.tenantId, scope.userId, metadata.name, metadata.style, metadata.season, metadata.occasion, metadata.favorite,
    ]);
    if (inserted.rowCount !== 1) throw new Error('Managed Outfit creation did not insert one aggregate');
    const created = await this.get(scope, outfitId);
    if (!created) throw new Error('Managed Outfit creation committed but could not be reloaded');
    return created;
  }

  async list(scope: GarmentOwnerScope): Promise<readonly ManagedOutfit[]> {
    const result = await this.pool.query(`${OUTFIT_SELECT}
      WHERE o.tenant_id=$1 AND o.user_id=$2 AND o.deleted_at IS NULL
      ORDER BY o.updated_at DESC,o.outfit_id`, [scope.tenantId, scope.userId]);
    return Object.freeze(result.rows.map(fromRow));
  }

  async get(scope: GarmentOwnerScope, outfitId: string): Promise<ManagedOutfit | undefined> {
    const canonicalOutfitId = normalizeUuid(outfitId);
    if (!canonicalOutfitId) return undefined;
    const result = await this.pool.query(`${OUTFIT_SELECT}
      WHERE o.outfit_id=$1 AND o.tenant_id=$2 AND o.user_id=$3 AND o.deleted_at IS NULL`,
    [canonicalOutfitId, scope.tenantId, scope.userId]);
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }

  async updateMetadata(
    scope: GarmentOwnerScope,
    outfitId: string,
    expectedRevision: number,
    rawPatch: unknown,
  ): Promise<ManagedOutfit> {
    const canonicalOutfitId = requireMutation(outfitId, expectedRevision);
    const patch = normalizePatch(rawPatch);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedOutfit(client, scope, canonicalOutfitId);
      if (!current) throw outfitNotFound();
      assertRevision(current, expectedRevision);
      assertEditable(current);
      const next = Object.freeze({
        name: patch.name ?? current.name,
        style: patch.style ?? current.style,
        season: patch.season ?? current.season,
        occasion: patch.occasion ?? current.occasion,
        favorite: patch.favorite ?? current.favorite,
      });
      if (next.name === current.name && next.style === current.style && next.season === current.season
        && next.occasion === current.occasion && next.favorite === current.favorite) {
        await client.query('COMMIT');
        return current;
      }
      const updated = await client.query(`UPDATE canonical_outfits
        SET name=$4,style=$5,season=$6,occasion=$7,favorite=$8,revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE outfit_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND revision=$9
        RETURNING revision`, [
        canonicalOutfitId, scope.tenantId, scope.userId, next.name, next.style, next.season, next.occasion, next.favorite, expectedRevision,
      ]);
      requireRevisionBump(updated, expectedRevision);
      const snapshot = await selectOutfit(client, scope, canonicalOutfitId);
      if (!snapshot || snapshot.revision !== expectedRevision + 1) throw new Error('Managed Outfit metadata mutation lost its revision');
      await client.query('COMMIT');
      return snapshot;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async archive(scope: GarmentOwnerScope, outfitId: string, expectedRevision: number): Promise<ManagedOutfit> {
    return this.setStatus(scope, outfitId, expectedRevision, 'ARCHIVED');
  }

  async restore(scope: GarmentOwnerScope, outfitId: string, expectedRevision: number): Promise<ManagedOutfit> {
    return this.setStatus(scope, outfitId, expectedRevision, 'ACTIVE');
  }

  async delete(scope: GarmentOwnerScope, outfitId: string, expectedRevision: number): Promise<number> {
    const canonicalOutfitId = requireMutation(outfitId, expectedRevision);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedOutfit(client, scope, canonicalOutfitId);
      if (!current) throw outfitNotFound();
      assertRevision(current, expectedRevision);
      const result = await client.query(`UPDATE canonical_outfits
        SET status='ARCHIVED',revision=revision+1,updated_at=CURRENT_TIMESTAMP,deleted_at=CURRENT_TIMESTAMP
        WHERE outfit_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND revision=$4
        RETURNING revision`, [canonicalOutfitId, scope.tenantId, scope.userId, expectedRevision]);
      const revision = Number(result.rows[0]?.revision);
      if (result.rowCount !== 1 || revision !== expectedRevision + 1) throw revisionConflict();
      await client.query('COMMIT');
      return revision;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async addEntry(
    scope: GarmentOwnerScope,
    outfitId: string,
    expectedRevision: number,
    input: Readonly<{ garmentId: unknown; layerRole?: unknown }>,
  ): Promise<ManagedOutfit> {
    const canonicalOutfitId = requireMutation(outfitId, expectedRevision);
    const garmentId = requireGarmentId(input.garmentId);
    const requestedRole = Object.hasOwn(input, 'layerRole') ? normalizeLayerRole(input.layerRole) : undefined;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedOutfit(client, scope, canonicalOutfitId);
      if (!current) throw outfitNotFound();
      assertRevision(current, expectedRevision);
      assertEditable(current);
      if (current.entries.length >= MAX_ENTRIES) throw httpError(409, 'outfit_entry_limit', `Outfit cannot contain more than ${MAX_ENTRIES} entries`);
      if (current.entries.some(entry => entry.garmentId === garmentId)) throw duplicateGarment();
      const category = await lockAvailableGarment(client, scope, garmentId);
      const layerRole = requestedRole ?? defaultOutfitLayerRole(category);
      assertRoleCompatible(category, layerRole);
      const entryId = requireGeneratedId(this.nextId(), 'Outfit entry');
      await client.query(`INSERT INTO canonical_outfit_entries
        (entry_id,outfit_id,garment_id,tenant_id,user_id,position,layer_role)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [entryId, canonicalOutfitId, garmentId, scope.tenantId, scope.userId, current.entries.length, layerRole]);
      await bumpOutfit(client, scope, canonicalOutfitId, expectedRevision);
      const snapshot = await selectOutfit(client, scope, canonicalOutfitId);
      if (!snapshot || snapshot.revision !== expectedRevision + 1 || !snapshot.entries.some(entry => entry.entryId === entryId)) {
        throw new Error('Managed Outfit add did not produce its expected entry');
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

  async removeEntry(
    scope: GarmentOwnerScope,
    outfitId: string,
    expectedRevision: number,
    entryId: string,
  ): Promise<ManagedOutfit> {
    const canonicalOutfitId = requireMutation(outfitId, expectedRevision);
    const canonicalEntryId = requireEntryId(entryId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedOutfit(client, scope, canonicalOutfitId);
      if (!current) throw outfitNotFound();
      assertRevision(current, expectedRevision);
      assertEditable(current);
      const entry = current.entries.find(candidate => candidate.entryId === canonicalEntryId);
      if (!entry) throw entryNotFound();
      const removed = await client.query(`DELETE FROM canonical_outfit_entries
        WHERE entry_id=$1 AND outfit_id=$2 AND tenant_id=$3 AND user_id=$4 RETURNING position`,
      [canonicalEntryId, canonicalOutfitId, scope.tenantId, scope.userId]);
      if (removed.rowCount !== 1) throw entryNotFound();
      await client.query(`UPDATE canonical_outfit_entries SET position=position-1
        WHERE outfit_id=$1 AND tenant_id=$2 AND user_id=$3 AND position>$4`,
      [canonicalOutfitId, scope.tenantId, scope.userId, entry.position]);
      await bumpOutfit(client, scope, canonicalOutfitId, expectedRevision);
      const snapshot = await selectOutfit(client, scope, canonicalOutfitId);
      if (!snapshot || snapshot.revision !== expectedRevision + 1 || snapshot.entries.some(candidate => candidate.entryId === canonicalEntryId)) {
        throw new Error('Managed Outfit remove did not produce its expected entry set');
      }
      assertDensePositions(snapshot.entries);
      await client.query('COMMIT');
      return snapshot;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async replaceEntry(
    scope: GarmentOwnerScope,
    outfitId: string,
    expectedRevision: number,
    entryId: string,
    input: Readonly<{ garmentId: unknown; layerRole?: unknown }>,
  ): Promise<ManagedOutfit> {
    const canonicalOutfitId = requireMutation(outfitId, expectedRevision);
    const canonicalEntryId = requireEntryId(entryId);
    const garmentId = requireGarmentId(input.garmentId);
    const requestedRole = Object.hasOwn(input, 'layerRole') ? normalizeLayerRole(input.layerRole) : undefined;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedOutfit(client, scope, canonicalOutfitId);
      if (!current) throw outfitNotFound();
      assertRevision(current, expectedRevision);
      assertEditable(current);
      const entry = current.entries.find(candidate => candidate.entryId === canonicalEntryId);
      if (!entry) throw entryNotFound();
      if (current.entries.some(candidate => candidate.entryId !== canonicalEntryId && candidate.garmentId === garmentId)) throw duplicateGarment();
      const category = await lockAvailableGarment(client, scope, garmentId);
      const layerRole = requestedRole ?? (entry.garmentId === garmentId && allowedOutfitLayerRoles(category).includes(entry.layerRole)
        ? entry.layerRole : defaultOutfitLayerRole(category));
      assertRoleCompatible(category, layerRole);
      if (entry.garmentId === garmentId && entry.layerRole === layerRole) {
        await client.query('COMMIT');
        return current;
      }
      const updated = await client.query(`UPDATE canonical_outfit_entries
        SET garment_id=$5,layer_role=$6
        WHERE entry_id=$1 AND outfit_id=$2 AND tenant_id=$3 AND user_id=$4
        RETURNING entry_id`,
      [canonicalEntryId, canonicalOutfitId, scope.tenantId, scope.userId, garmentId, layerRole]);
      if (updated.rowCount !== 1) throw entryNotFound();
      await bumpOutfit(client, scope, canonicalOutfitId, expectedRevision);
      const snapshot = await selectOutfit(client, scope, canonicalOutfitId);
      const replaced = snapshot?.entries.find(candidate => candidate.entryId === canonicalEntryId);
      if (!snapshot || snapshot.revision !== expectedRevision + 1 || !replaced
        || replaced.garmentId !== garmentId || replaced.layerRole !== layerRole || replaced.position !== entry.position) {
        throw new Error('Managed Outfit replace did not preserve stable entry identity and position');
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

  async setEntryRole(
    scope: GarmentOwnerScope,
    outfitId: string,
    expectedRevision: number,
    entryId: string,
    rawRole: unknown,
  ): Promise<ManagedOutfit> {
    const canonicalOutfitId = requireMutation(outfitId, expectedRevision);
    const canonicalEntryId = requireEntryId(entryId);
    const layerRole = normalizeLayerRole(rawRole);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedOutfit(client, scope, canonicalOutfitId);
      if (!current) throw outfitNotFound();
      assertRevision(current, expectedRevision);
      assertEditable(current);
      const entry = current.entries.find(candidate => candidate.entryId === canonicalEntryId);
      if (!entry) throw entryNotFound();
      const category = await lockAvailableGarment(client, scope, entry.garmentId);
      assertRoleCompatible(category, layerRole);
      if (entry.layerRole === layerRole) {
        await client.query('COMMIT');
        return current;
      }
      const updated = await client.query(`UPDATE canonical_outfit_entries SET layer_role=$5
        WHERE entry_id=$1 AND outfit_id=$2 AND tenant_id=$3 AND user_id=$4 RETURNING entry_id`,
      [canonicalEntryId, canonicalOutfitId, scope.tenantId, scope.userId, layerRole]);
      if (updated.rowCount !== 1) throw entryNotFound();
      await bumpOutfit(client, scope, canonicalOutfitId, expectedRevision);
      const snapshot = await selectOutfit(client, scope, canonicalOutfitId);
      if (!snapshot || snapshot.revision !== expectedRevision + 1
        || snapshot.entries.find(candidate => candidate.entryId === canonicalEntryId)?.layerRole !== layerRole) {
        throw new Error('Managed Outfit role mutation did not produce its expected state');
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

  async reorderEntries(
    scope: GarmentOwnerScope,
    outfitId: string,
    expectedRevision: number,
    rawEntryIds: unknown,
  ): Promise<ManagedOutfit> {
    const canonicalOutfitId = requireMutation(outfitId, expectedRevision);
    const entryIds = normalizeEntryPermutation(rawEntryIds);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedOutfit(client, scope, canonicalOutfitId);
      if (!current) throw outfitNotFound();
      assertRevision(current, expectedRevision);
      assertEditable(current);
      const currentIds = current.entries.map(entry => entry.entryId);
      if (entryIds.length !== currentIds.length || entryIds.some(id => !currentIds.includes(id))) {
        throw httpError(409, 'outfit_reorder_mismatch', 'Reorder must contain every current Outfit entry exactly once');
      }
      if (entryIds.every((id, index) => id === currentIds[index])) {
        await client.query('COMMIT');
        return current;
      }
      await client.query('SET CONSTRAINTS canonical_outfit_entries_outfit_position_unique DEFERRED');
      for (const [position, entryId] of entryIds.entries()) {
        const updated = await client.query(`UPDATE canonical_outfit_entries SET position=$5
          WHERE entry_id=$1 AND outfit_id=$2 AND tenant_id=$3 AND user_id=$4 RETURNING entry_id`,
        [entryId, canonicalOutfitId, scope.tenantId, scope.userId, position]);
        if (updated.rowCount !== 1) throw entryNotFound();
      }
      await bumpOutfit(client, scope, canonicalOutfitId, expectedRevision);
      const snapshot = await selectOutfit(client, scope, canonicalOutfitId);
      if (!snapshot || snapshot.revision !== expectedRevision + 1
        || snapshot.entries.some((entry, index) => entry.entryId !== entryIds[index])) {
        throw new Error('Managed Outfit reorder did not produce its exact requested permutation');
      }
      assertDensePositions(snapshot.entries);
      await client.query('COMMIT');
      return snapshot;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async duplicate(scope: GarmentOwnerScope, sourceOutfitId: string, rawName: unknown): Promise<ManagedOutfit> {
    const sourceId = requireOutfitId(sourceOutfitId);
    const name = normalizeName(rawName);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const sourceLock = await client.query(`SELECT outfit_id FROM canonical_outfits
        WHERE outfit_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL FOR SHARE`,
      [sourceId, scope.tenantId, scope.userId]);
      if (!sourceLock.rows[0]) throw outfitNotFound();
      const source = await selectOutfit(client, scope, sourceId);
      if (!source) throw outfitNotFound();
      if (source.entries.length > MAX_ENTRIES) throw new Error('Stored Outfit exceeds canonical entry limit');
      for (const entry of source.entries) {
        const category = await lockAvailableGarment(client, scope, entry.garmentId);
        assertRoleCompatible(category, entry.layerRole);
      }
      const targetId = requireGeneratedId(this.nextId(), 'Outfit');
      await client.query(`INSERT INTO canonical_outfits
        (outfit_id,tenant_id,user_id,name,style,season,occasion,favorite,status,revision)
        VALUES ($1,$2,$3,$4,$5,$6,$7,FALSE,'ACTIVE',1)`,
      [targetId, scope.tenantId, scope.userId, name, source.style, source.season, source.occasion]);
      for (const entry of source.entries) {
        await client.query(`INSERT INTO canonical_outfit_entries
          (entry_id,outfit_id,garment_id,tenant_id,user_id,position,layer_role)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [requireGeneratedId(this.nextId(), 'Outfit entry'), targetId, entry.garmentId, scope.tenantId, scope.userId, entry.position, entry.layerRole]);
      }
      const snapshot = await selectOutfit(client, scope, targetId);
      if (!snapshot || snapshot.revision !== 1 || snapshot.entries.length !== source.entries.length) {
        throw new Error('Managed Outfit duplicate did not produce its expected aggregate');
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

  private async setStatus(
    scope: GarmentOwnerScope,
    outfitId: string,
    expectedRevision: number,
    status: OutfitStatus,
  ): Promise<ManagedOutfit> {
    const canonicalOutfitId = requireMutation(outfitId, expectedRevision);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await lockedOutfit(client, scope, canonicalOutfitId);
      if (!current) throw outfitNotFound();
      assertRevision(current, expectedRevision);
      if (current.status === status) {
        await client.query('COMMIT');
        return current;
      }
      const updated = await client.query(`UPDATE canonical_outfits
        SET status=$4,revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE outfit_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND revision=$5
        RETURNING revision`, [canonicalOutfitId, scope.tenantId, scope.userId, status, expectedRevision]);
      requireRevisionBump(updated, expectedRevision);
      const snapshot = await selectOutfit(client, scope, canonicalOutfitId);
      if (!snapshot || snapshot.revision !== expectedRevision + 1 || snapshot.status !== status) {
        throw new Error('Managed Outfit lifecycle mutation did not produce its expected state');
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

const OUTFIT_SELECT = `SELECT
  o.outfit_id,o.name,o.style,o.season,o.occasion,o.favorite,o.status,o.revision,o.created_at,o.updated_at,
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'entry_id',e.entry_id,
    'garment_id',e.garment_id,
    'position',e.position,
    'layer_role',e.layer_role,
    'garment_category',g.category,
    'garment_available',(g.garment_id IS NOT NULL AND g.deleted_at IS NULL)
  ) ORDER BY e.position,e.entry_id)
    FROM canonical_outfit_entries e
    LEFT JOIN canonical_garments g
      ON g.garment_id=e.garment_id AND g.tenant_id=e.tenant_id AND g.user_id=e.user_id
    WHERE e.outfit_id=o.outfit_id AND e.tenant_id=o.tenant_id AND e.user_id=o.user_id), '[]'::jsonb) AS entries
  FROM canonical_outfits o`;

async function lockedOutfit(
  client: PoolClient,
  scope: GarmentOwnerScope,
  outfitId: string,
): Promise<ManagedOutfit | undefined> {
  const lock = await client.query(`SELECT outfit_id FROM canonical_outfits
    WHERE outfit_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL FOR UPDATE`,
  [outfitId, scope.tenantId, scope.userId]);
  return lock.rows[0] ? selectOutfit(client, scope, outfitId) : undefined;
}

async function selectOutfit(
  client: PoolClient,
  scope: GarmentOwnerScope,
  outfitId: string,
): Promise<ManagedOutfit | undefined> {
  const result = await client.query(`${OUTFIT_SELECT}
    WHERE o.outfit_id=$1 AND o.tenant_id=$2 AND o.user_id=$3 AND o.deleted_at IS NULL`,
  [outfitId, scope.tenantId, scope.userId]);
  return result.rows[0] ? fromRow(result.rows[0]) : undefined;
}

async function lockAvailableGarment(client: PoolClient, scope: GarmentOwnerScope, garmentId: string): Promise<GarmentCategory> {
  const result = await client.query(`SELECT category FROM canonical_garments
    WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL FOR SHARE`,
  [garmentId, scope.tenantId, scope.userId]);
  if (!result.rows[0]) throw garmentNotFound();
  return storedCategory(result.rows[0].category);
}

async function bumpOutfit(
  client: PoolClient,
  scope: GarmentOwnerScope,
  outfitId: string,
  expectedRevision: number,
): Promise<void> {
  const result = await client.query(`UPDATE canonical_outfits
    SET revision=revision+1,updated_at=CURRENT_TIMESTAMP
    WHERE outfit_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL AND revision=$4
    RETURNING revision`, [outfitId, scope.tenantId, scope.userId, expectedRevision]);
  requireRevisionBump(result, expectedRevision);
}

function requireRevisionBump(result: { rowCount: number | null; rows: any[] }, expectedRevision: number): void {
  if (result.rowCount !== 1 || Number(result.rows[0]?.revision) !== expectedRevision + 1) throw revisionConflict();
}

function assertRevision(outfit: ManagedOutfit, expectedRevision: number): void {
  if (outfit.revision !== expectedRevision) throw revisionConflict();
}

function assertEditable(outfit: ManagedOutfit): void {
  if (outfit.status !== 'ACTIVE') throw httpError(409, 'outfit_archived', 'Archived Outfit must be restored before it can be changed');
}

function assertDensePositions(entries: readonly ManagedOutfitEntry[]): void {
  if (entries.some((entry, index) => entry.position !== index)) throw new Error('Stored Outfit entry positions are not dense');
}

function assertRoleCompatible(category: GarmentCategory, role: OutfitLayerRole): void {
  if (!allowedOutfitLayerRoles(category).includes(role)) {
    throw httpError(409, 'outfit_layer_role_incompatible', `Layer role ${role} is incompatible with Garment category ${category}`);
  }
}

function normalizeCreate(input: Readonly<{ name: unknown; style?: unknown; season?: unknown; occasion?: unknown; favorite?: unknown }>) {
  return Object.freeze({
    name: normalizeName(input.name),
    style: Object.hasOwn(input, 'style') ? normalizeStyle(input.style) : 'casual' as OutfitStyle,
    season: Object.hasOwn(input, 'season') ? normalizeSeason(input.season) : 'all_season' as OutfitSeason,
    occasion: Object.hasOwn(input, 'occasion') ? normalizeOccasion(input.occasion) : 'casual' as OutfitOccasion,
    favorite: Object.hasOwn(input, 'favorite') ? normalizeFavorite(input.favorite) : false,
  });
}

function normalizePatch(value: unknown): Readonly<{
  name?: string; style?: OutfitStyle; season?: OutfitSeason; occasion?: OutfitOccasion; favorite?: boolean;
}> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'invalid_outfit_patch', 'Outfit patch must be a JSON object');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0 || keys.some(key => !PATCH_KEYS.has(key))) {
    throw httpError(400, 'invalid_outfit_patch', 'Outfit patch contains no supported fields or includes unknown fields');
  }
  return Object.freeze({
    ...(Object.hasOwn(record, 'name') ? { name: normalizeName(record.name) } : {}),
    ...(Object.hasOwn(record, 'style') ? { style: normalizeStyle(record.style) } : {}),
    ...(Object.hasOwn(record, 'season') ? { season: normalizeSeason(record.season) } : {}),
    ...(Object.hasOwn(record, 'occasion') ? { occasion: normalizeOccasion(record.occasion) } : {}),
    ...(Object.hasOwn(record, 'favorite') ? { favorite: normalizeFavorite(record.favorite) } : {}),
  });
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') throw httpError(400, 'invalid_outfit_name', 'Outfit name must be a string');
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!name || Array.from(name).length > 200 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw httpError(400, 'invalid_outfit_name', 'Outfit name must contain 1 to 200 printable characters');
  }
  return name;
}

function normalizeStyle(value: unknown): OutfitStyle {
  return normalizeEnum(value, OUTFIT_STYLES, 'invalid_outfit_style', 'Outfit style is unsupported') as OutfitStyle;
}
function normalizeSeason(value: unknown): OutfitSeason {
  return normalizeEnum(value, OUTFIT_SEASONS, 'invalid_outfit_season', 'Outfit season is unsupported') as OutfitSeason;
}
function normalizeOccasion(value: unknown): OutfitOccasion {
  return normalizeEnum(value, OUTFIT_OCCASIONS, 'invalid_outfit_occasion', 'Outfit occasion is unsupported') as OutfitOccasion;
}
function normalizeLayerRole(value: unknown): OutfitLayerRole {
  if (typeof value !== 'string') throw httpError(400, 'invalid_outfit_layer_role', 'Outfit layer role must be a string');
  const role = value.normalize('NFKC').trim().toUpperCase();
  if (!(OUTFIT_LAYER_ROLES as readonly string[]).includes(role)) {
    throw httpError(400, 'invalid_outfit_layer_role', 'Outfit layer role is unsupported');
  }
  return role as OutfitLayerRole;
}
function normalizeFavorite(value: unknown): boolean {
  if (typeof value !== 'boolean') throw httpError(400, 'invalid_outfit_favorite', 'Outfit favorite must be boolean');
  return value;
}
function normalizeEnum(value: unknown, values: readonly string[], code: string, message: string): string {
  const normalized = typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : '';
  if (!values.includes(normalized)) throw httpError(400, code, message);
  return normalized;
}

function normalizeEntryPermutation(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) {
    throw httpError(400, 'invalid_outfit_reorder', `Outfit reorder must be an array with at most ${MAX_ENTRIES} entry IDs`);
  }
  const ids = value.map(requireEntryId);
  if (new Set(ids).size !== ids.length) throw httpError(400, 'invalid_outfit_reorder', 'Outfit reorder cannot contain duplicate entry IDs');
  return Object.freeze(ids);
}

function fromRow(row: any): ManagedOutfit {
  const id = normalizeUuid(row.outfit_id);
  if (!id) throw new Error('Stored Outfit ID is invalid');
  const style = storedEnum(row.style, OUTFIT_STYLES, 'Outfit style') as OutfitStyle;
  const season = storedEnum(row.season, OUTFIT_SEASONS, 'Outfit season') as OutfitSeason;
  const occasion = storedEnum(row.occasion, OUTFIT_OCCASIONS, 'Outfit occasion') as OutfitOccasion;
  const status = row.status === 'ACTIVE' || row.status === 'ARCHIVED' ? row.status as OutfitStatus : undefined;
  if (!status) throw new Error('Stored Outfit status is invalid');
  const favorite = row.favorite;
  if (typeof favorite !== 'boolean') throw new Error('Stored Outfit favorite is invalid');
  const revision = Number(row.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Stored Outfit revision is invalid');
  const rawEntries = Array.isArray(row.entries) ? row.entries : [];
  const entries = Object.freeze(rawEntries.map((raw: any): ManagedOutfitEntry => {
    const entryId = normalizeUuid(raw.entry_id);
    const garmentId = normalizeUuid(raw.garment_id);
    if (!entryId || !garmentId) throw new Error('Stored Outfit entry identity is invalid');
    const position = Number(raw.position);
    if (!Number.isInteger(position) || position < 0 || position >= MAX_ENTRIES) throw new Error('Stored Outfit entry position is invalid');
    const layerRole = storedLayerRole(raw.layer_role);
    const available = raw.garment_available === true;
    let category: GarmentCategory | undefined;
    if (raw.garment_category !== null && raw.garment_category !== undefined) category = storedCategory(raw.garment_category);
    const referenceReadiness: OutfitEntryReferenceReadiness = !available
      ? 'GARMENT_UNAVAILABLE'
      : !category || !allowedOutfitLayerRoles(category).includes(layerRole)
        ? 'ROLE_REVIEW_REQUIRED'
        : 'READY';
    return Object.freeze({ entryId, garmentId, position, layerRole, ...(category ? { garmentCategory: category } : {}), referenceReadiness });
  }).sort((left: ManagedOutfitEntry, right: ManagedOutfitEntry) => left.position - right.position || left.entryId.localeCompare(right.entryId))));
  assertDensePositions(entries);
  const referenceReadiness: OutfitReferenceReadiness = entries.length === 0
    ? 'EMPTY'
    : entries.some(entry => entry.referenceReadiness === 'GARMENT_UNAVAILABLE')
      ? 'GARMENT_UNAVAILABLE'
      : entries.some(entry => entry.referenceReadiness === 'ROLE_REVIEW_REQUIRED')
        ? 'ROLE_REVIEW_REQUIRED'
        : 'REFERENCES_READY';
  return Object.freeze({
    id,
    name: String(row.name),
    style,
    season,
    occasion,
    favorite,
    status,
    revision,
    entries,
    referenceReadiness,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });
}

function storedCategory(value: unknown): GarmentCategory {
  const category = String(value ?? '').toLowerCase();
  if (!(GARMENT_CATEGORIES as readonly string[]).includes(category)) throw new Error('Stored Garment category is invalid');
  return category as GarmentCategory;
}
function storedLayerRole(value: unknown): OutfitLayerRole {
  const role = String(value ?? '').toUpperCase();
  if (!(OUTFIT_LAYER_ROLES as readonly string[]).includes(role)) throw new Error('Stored Outfit layer role is invalid');
  return role as OutfitLayerRole;
}
function storedEnum(value: unknown, values: readonly string[], label: string): string {
  const normalized = String(value ?? '').toLowerCase();
  if (!values.includes(normalized)) throw new Error(`Stored ${label} is invalid`);
  return normalized;
}

function requireMutation(outfitId: string, expectedRevision: number): string {
  const canonicalOutfitId = requireOutfitId(outfitId);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw httpError(400, 'invalid_outfit_revision', 'Expected Outfit revision is invalid');
  }
  return canonicalOutfitId;
}
function requireOutfitId(value: unknown): string {
  const id = normalizeUuid(value);
  if (!id) throw outfitNotFound();
  return id;
}
function requireEntryId(value: unknown): string {
  const id = normalizeUuid(value);
  if (!id) throw entryNotFound();
  return id;
}
function requireGarmentId(value: unknown): string {
  const id = normalizeUuid(value);
  if (!id) throw garmentNotFound();
  return id;
}
function requireGeneratedId(value: unknown, label: string): string {
  const id = normalizeUuid(value);
  if (!id) throw new Error(`${label} ID generator returned an invalid UUID`);
  return id;
}
function normalizeUuid(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_PATTERN.test(value) ? value.toLowerCase() : undefined;
}

function outfitNotFound() { return httpError(404, 'outfit_not_found', 'Outfit not found'); }
function entryNotFound() { return httpError(404, 'outfit_entry_not_found', 'Outfit entry not found'); }
function garmentNotFound() { return httpError(404, 'garment_not_found', 'Garment not found'); }
function duplicateGarment() { return httpError(409, 'outfit_duplicate_garment', 'Garment is already present in this Outfit'); }
function revisionConflict() { return httpError(412, 'outfit_revision_conflict', 'Outfit revision changed; reload before mutating it'); }
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
