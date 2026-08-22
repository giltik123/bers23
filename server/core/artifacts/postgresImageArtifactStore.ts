import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Pool } from 'pg';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';

export type StoredFinalImage = Readonly<{ storageId: string; tenantId: string; userId: string; projectId: string; executionId: string; operationId: string; role: 'COMPOSITE'; lifecycle: 'FINAL'; width: number; height: number; encoding: 'PNG_RGBA8_LOSSLESS'; contentType: 'image/png'; bytes: Uint8Array }>;
export type StoredImage = Omit<StoredFinalImage, 'executionId'|'operationId'|'role'|'lifecycle'> & { executionId?: string; operationId?: string; role: 'ORIGINAL'|'COMPOSITE'; lifecycle: 'IMMUTABLE'|'FINAL' };

/** Durable blob implementation behind the canonical artifact authority. */
export class PostgresImageArtifactStore {
  private readonly pool: Pool; private readonly nextId: () => string;
  constructor(pool: Pool, nextId: () => string = randomUUID) { this.pool = pool; this.nextId = nextId; }
  async persistFinal(scope: AuthenticatedScope & { projectId: string }, executionId: string, operationId: string, image: PixelImage): Promise<StoredFinalImage> {
    if (image.data.length !== image.width * image.height * 4) throw new Error('Malformed final COMPOSITE pixels');
    const bytes = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
    const storageId = this.nextId();
    const result = await this.pool.query(`INSERT INTO canonical_image_artifacts
      (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes)
      VALUES ($1,$2,$3,$4,$5,$6,'COMPOSITE','FINAL',$7,$8,'PNG_RGBA8_LOSSLESS','image/png',$9)
      ON CONFLICT (tenant_id,user_id,project_id,execution_id) WHERE revoked_at IS NULL AND deleted_at IS NULL DO UPDATE SET execution_id=EXCLUDED.execution_id
      RETURNING *`, [storageId, scope.tenantId, scope.userId, scope.projectId, executionId, operationId, image.width, image.height, bytes]);
    const row = result.rows[0];
    return Object.freeze({ storageId: row.storage_id, tenantId: row.tenant_id, userId: row.user_id, projectId: row.project_id, executionId: row.execution_id, operationId: row.operation_id, role: row.role, lifecycle: row.lifecycle, width: row.width, height: row.height, encoding: row.encoding, contentType: row.content_type, bytes: new Uint8Array(row.image_bytes) });
  }
  async load(storageId: string, scope: AuthenticatedScope & { projectId: string }): Promise<StoredFinalImage | undefined> {
    const result = await this.pool.query(`SELECT * FROM canonical_image_artifacts WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4
      AND role='COMPOSITE' AND lifecycle='FINAL' AND revoked_at IS NULL AND deleted_at IS NULL`, [storageId, scope.tenantId, scope.userId, scope.projectId]);
    const row = result.rows[0]; if (!row) return undefined;
    return Object.freeze({ storageId: row.storage_id, tenantId: row.tenant_id, userId: row.user_id, projectId: row.project_id, executionId: row.execution_id, operationId: row.operation_id, role: row.role, lifecycle: row.lifecycle, width: row.width, height: row.height, encoding: row.encoding, contentType: row.content_type, bytes: new Uint8Array(row.image_bytes) });
  }
  async loadSource(storageId: string, scope: AuthenticatedScope & { projectId: string }): Promise<StoredImage | undefined> { const result=await this.pool.query(`SELECT * FROM canonical_image_artifacts WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4 AND ((role='ORIGINAL' AND lifecycle='IMMUTABLE') OR (role='COMPOSITE' AND lifecycle='FINAL')) AND revoked_at IS NULL AND deleted_at IS NULL`,[storageId,scope.tenantId,scope.userId,scope.projectId]); const row=result.rows[0]; if(!row)return undefined; return Object.freeze({storageId:row.storage_id,tenantId:row.tenant_id,userId:row.user_id,projectId:row.project_id,executionId:row.execution_id,operationId:row.operation_id,role:row.role,lifecycle:row.lifecycle,width:row.width,height:row.height,encoding:row.encoding,contentType:row.content_type,bytes:new Uint8Array(row.image_bytes)}); }
}
