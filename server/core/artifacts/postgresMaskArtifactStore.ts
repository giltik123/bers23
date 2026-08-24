import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Pool } from 'pg';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';

export const MASK_ROLE = 'MASK' as const;
export const MASK_ENCODING = 'ALPHA_8_LOSSLESS' as const;
export const MASK_COORDINATE_SPACE = 'ORIGINAL' as const;

export type StoredMask = Readonly<{ storageId: string; tenantId: string; userId: string; projectId: string; width: number; height: number; png: Uint8Array }>;

/** PostgreSQL is the durable, server-owned blob authority for canonical masks. */
export class PostgresMaskArtifactStore {
  private readonly pool: Pool; private readonly nextId: () => string;
  constructor(pool: Pool, nextId: () => string = randomUUID) { this.pool = pool; this.nextId = nextId; }

  async persist(scope: AuthenticatedScope & { projectId: string }, width: number, height: number, alpha: Uint8Array): Promise<StoredMask> {
    const png = await encodeMask(width, height, alpha);
    const storageId = this.nextId();
    await this.pool.query(`INSERT INTO canonical_mask_artifacts
      (storage_id, tenant_id, user_id, project_id, role, encoding, coordinate_space, width, height, png_bytes)
      VALUES ($1,$2,$3,$4,'MASK','ALPHA_8_LOSSLESS','ORIGINAL',$5,$6,$7)`,
    [storageId, scope.tenantId, scope.userId, scope.projectId, width, height, png]);
    return freezeStoredMask({ storageId, ...scope, width, height, png: new Uint8Array(png) });
  }

  /** One local execution ticket may mint at most one immutable canonical MASK row. */
  async persistLocalExecution(ticketId: string, scope: AuthenticatedScope & { projectId: string }, width: number, height: number, alpha: Uint8Array): Promise<StoredMask> {
    if (!ticketId) throw new Error('Local execution ticket identity is required for MASK persistence');
    const png = await encodeMask(width, height, alpha);
    const storageId = this.nextId();
    const result = await this.pool.query(`INSERT INTO canonical_mask_artifacts
      (storage_id, tenant_id, user_id, project_id, role, encoding, coordinate_space, width, height, png_bytes, local_execution_ticket_id)
      VALUES ($1,$2,$3,$4,'MASK','ALPHA_8_LOSSLESS','ORIGINAL',$5,$6,$7,$8)
      ON CONFLICT (local_execution_ticket_id) WHERE local_execution_ticket_id IS NOT NULL
      DO UPDATE SET local_execution_ticket_id=EXCLUDED.local_execution_ticket_id
      RETURNING storage_id, tenant_id, user_id, project_id, width, height, png_bytes`,
    [storageId, scope.tenantId, scope.userId, scope.projectId, width, height, png, ticketId]);
    const row = result.rows[0];
    if (!row) throw new Error('Canonical local MASK persistence failed');
    const storedPng = Buffer.from(row.png_bytes);
    const same = row.tenant_id === scope.tenantId && row.user_id === scope.userId && row.project_id === scope.projectId && Number(row.width) === width && Number(row.height) === height && storedPng.equals(png);
    if (!same) throw new Error('Local execution ticket is already bound to a different canonical MASK');
    return freezeStoredMask({ storageId: row.storage_id, tenantId: row.tenant_id, userId: row.user_id, projectId: row.project_id, width: Number(row.width), height: Number(row.height), png: new Uint8Array(storedPng) });
  }

  /** Durable recovery path for an already committed local execution replay. */
  async loadLocalExecution(ticketId: string, scope: AuthenticatedScope & { projectId: string }): Promise<StoredMask | undefined> {
    if (!ticketId) return undefined;
    const result = await this.pool.query(`SELECT storage_id, tenant_id, user_id, project_id, width, height, png_bytes
      FROM canonical_mask_artifacts
      WHERE local_execution_ticket_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4
        AND role='MASK' AND encoding='ALPHA_8_LOSSLESS' AND coordinate_space='ORIGINAL' AND revoked_at IS NULL`,
    [ticketId, scope.tenantId, scope.userId, scope.projectId]);
    const row = result.rows[0]; if (!row) return undefined;
    return freezeStoredMask({ storageId: row.storage_id, tenantId: row.tenant_id, userId: row.user_id, projectId: row.project_id, width: Number(row.width), height: Number(row.height), png: new Uint8Array(row.png_bytes) });
  }

  async load(storageId: string, scope: AuthenticatedScope & { projectId: string }): Promise<StoredMask | undefined> {
    const result = await this.pool.query(`SELECT storage_id, tenant_id, user_id, project_id, width, height, png_bytes
      FROM canonical_mask_artifacts WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4 AND role='MASK'
      AND encoding='ALPHA_8_LOSSLESS' AND coordinate_space='ORIGINAL' AND revoked_at IS NULL`,
    [storageId, scope.tenantId, scope.userId, scope.projectId]);
    const row = result.rows[0]; if (!row) return undefined;
    return freezeStoredMask({ storageId: row.storage_id, tenantId: row.tenant_id, userId: row.user_id, projectId: row.project_id, width: Number(row.width), height: Number(row.height), png: new Uint8Array(row.png_bytes) });
  }
}

async function encodeMask(width: number, height: number, alpha: Uint8Array): Promise<Buffer> {
  return sharp(alpha, { raw: { width, height, channels: 1 } }).toColourspace('b-w').png({ compressionLevel: 9, colours: 256 }).toBuffer();
}
function freezeStoredMask(value: StoredMask): StoredMask { return Object.freeze({ ...value, png: Uint8Array.from(value.png) }); }
