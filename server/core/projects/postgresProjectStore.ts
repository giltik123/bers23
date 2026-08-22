import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Pool } from 'pg';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';

export class PostgresProjectStore {
  constructor(private readonly pool: Pool) {}
  async create(scope: AuthenticatedScope, name: string, upload: Uint8Array, limits: { maxDimension: number; maxPixels: number }) {
    let normalized;
    try { normalized = await sharp(upload, { failOn: 'error', limitInputPixels: limits.maxPixels }).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true }); }
    catch { throw Object.assign(new Error('Uploaded image is malformed or unsafe'), { status: 400, code: 'invalid_image' }); }
    const { width, height } = normalized.info;
    if (!width || !height || width > limits.maxDimension || height > limits.maxDimension || width * height > limits.maxPixels) throw Object.assign(new Error('Decoded image dimensions are unsafe'), { status: 400, code: 'invalid_image_dimensions' });
    const png = await sharp(normalized.data, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
    const projectId = randomUUID(), storageId = randomUUID(), client = await this.pool.connect();
    try { await client.query('BEGIN');
      await client.query(`INSERT INTO canonical_image_artifacts (storage_id,tenant_id,user_id,project_id,role,lifecycle,width,height,encoding,content_type,image_bytes) VALUES ($1,$2,$3,$4,'ORIGINAL','IMMUTABLE',$5,$6,'PNG_RGBA8_LOSSLESS','image/png',$7)`, [storageId,scope.tenantId,scope.userId,projectId,width,height,png]);
      const result = await client.query(`INSERT INTO canonical_projects (project_id,tenant_id,user_id,name,original_image_storage_id,current_image_storage_id,width,height) VALUES ($1,$2,$3,$4,$5,$5,$6,$7) RETURNING *`, [projectId,scope.tenantId,scope.userId,name,storageId,width,height]);
      await client.query('COMMIT'); return result.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async list(scope: AuthenticatedScope) { return (await this.pool.query(`SELECT * FROM canonical_projects WHERE tenant_id=$1 AND user_id=$2 AND deleted_at IS NULL ORDER BY updated_at DESC`, [scope.tenantId,scope.userId])).rows; }
  async get(scope: AuthenticatedScope, id: string) { return (await this.pool.query(`SELECT * FROM canonical_projects WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL`, [id,scope.tenantId,scope.userId])).rows[0]; }
  async update(scope: AuthenticatedScope, id: string, patch: Record<string, unknown>) { const allowed = ['name','favorite','archived','status','objects']; const keys = Object.keys(patch); if (!keys.length || keys.some(k => !allowed.includes(k))) throw Object.assign(new Error('Project patch contains unsupported fields'), { status: 400, code: 'invalid_project_patch' }); const values = keys.map(k => k === 'objects' ? JSON.stringify(patch[k]) : patch[k]); const sets = keys.map((k,i) => `${k}=$${i+4}${k === 'objects' ? '::jsonb' : ''}`); return (await this.pool.query(`UPDATE canonical_projects SET ${sets.join(',')},updated_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL RETURNING *`, [id,scope.tenantId,scope.userId,...values])).rows[0]; }
  async delete(scope: AuthenticatedScope, id: string) { const client=await this.pool.connect(); try { await client.query('BEGIN'); const row=(await client.query(`UPDATE canonical_projects SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL RETURNING original_image_storage_id,current_image_storage_id`,[id,scope.tenantId,scope.userId])).rows[0]; if (row) await client.query(`UPDATE canonical_image_artifacts SET deleted_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND storage_id=ANY($4::uuid[])`,[scope.tenantId,scope.userId,id,[row.original_image_storage_id,row.current_image_storage_id]]); await client.query('COMMIT'); return Boolean(row); } catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();} }
}
