import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Pool, PoolClient } from 'pg';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';

type AcceptFinalInput = Readonly<{ storageId: string; executionId?: string; instruction: string; operation?: string; creditsUsed?: number }>;

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
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO canonical_image_artifacts (storage_id,tenant_id,user_id,project_id,role,lifecycle,width,height,encoding,content_type,image_bytes) VALUES ($1,$2,$3,$4,'ORIGINAL','IMMUTABLE',$5,$6,'PNG_RGBA8_LOSSLESS','image/png',$7)`, [storageId,scope.tenantId,scope.userId,projectId,width,height,png]);
      const result = await client.query(`INSERT INTO canonical_projects (project_id,tenant_id,user_id,name,original_image_storage_id,current_image_storage_id,width,height,history_cursor) VALUES ($1,$2,$3,$4,$5,$5,$6,$7,-1) RETURNING *`, [projectId,scope.tenantId,scope.userId,name,storageId,width,height]);
      await client.query(`INSERT INTO canonical_project_history_entries (entry_id,tenant_id,user_id,project_id,sequence,source_image_storage_id,result_image_storage_id,instruction,operation) VALUES ($1,$2,$3,$1,-1,$4,$4,'','original')`, [projectId,scope.tenantId,scope.userId,storageId]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async list(scope: AuthenticatedScope) { return (await this.pool.query(`SELECT * FROM canonical_projects WHERE tenant_id=$1 AND user_id=$2 AND deleted_at IS NULL ORDER BY updated_at DESC`, [scope.tenantId,scope.userId])).rows; }
  async get(scope: AuthenticatedScope, id: string) { return (await this.pool.query(`SELECT * FROM canonical_projects WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL`, [id,scope.tenantId,scope.userId])).rows[0]; }

  async history(scope: AuthenticatedScope, id: string) {
    return (await this.pool.query(`SELECT * FROM canonical_project_history_entries WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND retired_at IS NULL ORDER BY sequence ASC`, [id,scope.tenantId,scope.userId])).rows;
  }

  async versions(scope: AuthenticatedScope, id: string) {
    return (await this.pool.query(`SELECT * FROM canonical_project_versions WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL ORDER BY created_at DESC`, [id,scope.tenantId,scope.userId])).rows;
  }

  async update(scope: AuthenticatedScope, id: string, patch: Record<string, unknown>) {
    const allowed = ['name','favorite','archived','status','objects'];
    const keys = Object.keys(patch);
    if (!keys.length || keys.some(k => !allowed.includes(k))) throw Object.assign(new Error('Project patch contains unsupported fields'), { status: 400, code: 'invalid_project_patch' });
    const values = keys.map(k => k === 'objects' ? JSON.stringify(patch[k]) : patch[k]);
    const sets = keys.map((k,i) => `${k}=$${i+4}${k === 'objects' ? '::jsonb' : ''}`);
    return (await this.pool.query(`UPDATE canonical_projects SET ${sets.join(',')},updated_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL RETURNING *`, [id,scope.tenantId,scope.userId,...values])).rows[0];
  }

  async acceptFinal(scope: AuthenticatedScope, id: string, input: AcceptFinalInput) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const project = await this.lockProject(client, scope, id);
      const artifact = (await client.query(`SELECT storage_id,execution_id,operation_id,width,height FROM canonical_image_artifacts WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4 AND role='COMPOSITE' AND lifecycle='FINAL' AND revoked_at IS NULL AND deleted_at IS NULL FOR SHARE`, [input.storageId,scope.tenantId,scope.userId,id])).rows[0];
      if (!artifact) throw conflict('final_artifact_unavailable', 'FINAL artifact is unavailable for this Project');
      if (input.executionId && artifact.execution_id !== input.executionId) throw conflict('execution_mismatch', 'FINAL execution does not match acceptance request');
      if (artifact.width !== project.width || artifact.height !== project.height) throw conflict('final_dimensions_mismatch', 'FINAL dimensions do not match the Project');
      const existing = (await client.query(`SELECT * FROM canonical_project_history_entries WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND execution_id=$4 LIMIT 1`, [scope.tenantId,scope.userId,id,artifact.execution_id])).rows[0];
      if (existing) {
        if (!existing.retired_at && Number(project.history_cursor) === Number(existing.sequence) && project.current_image_storage_id === artifact.storage_id) { await client.query('COMMIT'); return project; }
        throw conflict('final_already_accepted', 'FINAL artifact was already accepted into Project history');
      }
      await this.retireRedo(client, scope, id, Number(project.history_cursor));
      const sequence = Number(project.history_cursor) + 1;
      await client.query(`INSERT INTO canonical_project_history_entries (entry_id,tenant_id,user_id,project_id,sequence,source_image_storage_id,result_image_storage_id,execution_id,operation_id,instruction,operation,credits_used) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [randomUUID(),scope.tenantId,scope.userId,id,sequence,project.current_image_storage_id,artifact.storage_id,artifact.execution_id,artifact.operation_id,input.instruction,input.operation || 'edit',Math.max(0,Number(input.creditsUsed || 0))]);
      const updated = (await client.query(`UPDATE canonical_projects SET current_image_storage_id=$1,history_cursor=$2,objects='[]'::jsonb,status='editing',updated_at=CURRENT_TIMESTAMP WHERE project_id=$3 AND tenant_id=$4 AND user_id=$5 RETURNING *`, [artifact.storage_id,sequence,id,scope.tenantId,scope.userId])).rows[0];
      await client.query('COMMIT');
      return updated;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }

  async undo(scope: AuthenticatedScope, id: string) { return this.navigate(scope,id,'undo'); }
  async redo(scope: AuthenticatedScope, id: string) { return this.navigate(scope,id,'redo'); }

  async restoreOriginal(scope: AuthenticatedScope, id: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN'); const project = await this.lockProject(client,scope,id);
      const updated=(await client.query(`UPDATE canonical_projects SET current_image_storage_id=original_image_storage_id,history_cursor=-1,objects='[]'::jsonb,updated_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 RETURNING *`,[id,scope.tenantId,scope.userId])).rows[0];
      await client.query('COMMIT'); return updated ?? project;
    } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
  }

  async createVersion(scope: AuthenticatedScope, id: string, name: string) {
    const normalized=name.trim(); if(!normalized||normalized.length>200) throw Object.assign(new Error('Version name is invalid'),{status:400,code:'invalid_version_name'});
    const client=await this.pool.connect();
    try { await client.query('BEGIN'); const project=await this.lockProject(client,scope,id); const version=(await client.query(`INSERT INTO canonical_project_versions (version_id,tenant_id,user_id,project_id,name,image_storage_id,history_sequence) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[randomUUID(),scope.tenantId,scope.userId,id,normalized,project.current_image_storage_id,project.history_cursor])).rows[0]; await client.query('COMMIT'); return version; }
    catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
  }

  async restoreVersion(scope: AuthenticatedScope, id: string, versionId: string) {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN'); const project=await this.lockProject(client,scope,id);
      const version=(await client.query(`SELECT * FROM canonical_project_versions WHERE version_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4 AND deleted_at IS NULL FOR SHARE`,[versionId,id,scope.tenantId,scope.userId])).rows[0];
      if(!version) throw Object.assign(new Error('Version not found'),{status:404,code:'version_not_found'});
      const image=(await client.query(`SELECT storage_id FROM canonical_image_artifacts WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4 AND revoked_at IS NULL AND deleted_at IS NULL AND ((role='ORIGINAL' AND lifecycle='IMMUTABLE') OR (role='COMPOSITE' AND lifecycle='FINAL'))`,[version.image_storage_id,scope.tenantId,scope.userId,id])).rows[0];
      if(!image) throw conflict('version_artifact_unavailable','Version artifact is unavailable');
      await this.retireRedo(client,scope,id,Number(project.history_cursor)); const sequence=Number(project.history_cursor)+1;
      await client.query(`INSERT INTO canonical_project_history_entries (entry_id,tenant_id,user_id,project_id,sequence,source_image_storage_id,result_image_storage_id,instruction,operation,credits_used) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'restore_version',0)`,[randomUUID(),scope.tenantId,scope.userId,id,sequence,project.current_image_storage_id,version.image_storage_id,`Restored version "${version.name}"`]);
      const updated=(await client.query(`UPDATE canonical_projects SET current_image_storage_id=$1,history_cursor=$2,objects='[]'::jsonb,updated_at=CURRENT_TIMESTAMP WHERE project_id=$3 AND tenant_id=$4 AND user_id=$5 RETURNING *`,[version.image_storage_id,sequence,id,scope.tenantId,scope.userId])).rows[0];
      await client.query('COMMIT'); return updated;
    } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
  }

  async delete(scope: AuthenticatedScope, id: string) {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row=(await client.query(`UPDATE canonical_projects SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL RETURNING project_id`,[id,scope.tenantId,scope.userId])).rows[0];
      if(row){
        await client.query(`UPDATE canonical_image_artifacts SET deleted_at=COALESCE(deleted_at,CURRENT_TIMESTAMP) WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3`,[scope.tenantId,scope.userId,id]);
        await client.query(`UPDATE canonical_project_versions SET deleted_at=COALESCE(deleted_at,CURRENT_TIMESTAMP) WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3`,[scope.tenantId,scope.userId,id]);
        await client.query(`UPDATE canonical_project_history_entries SET retired_at=COALESCE(retired_at,CURRENT_TIMESTAMP) WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3`,[scope.tenantId,scope.userId,id]);
      }
      await client.query('COMMIT'); return Boolean(row);
    } catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }

  private async navigate(scope: AuthenticatedScope,id:string,direction:'undo'|'redo') {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN'); const project=await this.lockProject(client,scope,id); const cursor=Number(project.history_cursor);
      const comparison=direction==='undo'?'<':'>'; const ordering=direction==='undo'?'DESC':'ASC';
      const target=(await client.query(`SELECT * FROM canonical_project_history_entries WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND retired_at IS NULL AND sequence ${comparison} $4 ORDER BY sequence ${ordering} LIMIT 1`,[id,scope.tenantId,scope.userId,cursor])).rows[0];
      if(!target){await client.query('COMMIT');return project;}
      const updated=(await client.query(`UPDATE canonical_projects SET current_image_storage_id=$1,history_cursor=$2,objects='[]'::jsonb,updated_at=CURRENT_TIMESTAMP WHERE project_id=$3 AND tenant_id=$4 AND user_id=$5 RETURNING *`,[target.result_image_storage_id,target.sequence,id,scope.tenantId,scope.userId])).rows[0];
      await client.query('COMMIT'); return updated;
    } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
  }

  private async lockProject(client: PoolClient, scope: AuthenticatedScope, id: string) {
    const project=(await client.query(`SELECT * FROM canonical_projects WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL FOR UPDATE`,[id,scope.tenantId,scope.userId])).rows[0];
    if(!project) throw Object.assign(new Error('Project not found'),{status:404,code:'project_not_found'});
    return project;
  }

  private async retireRedo(client: PoolClient, scope: AuthenticatedScope, id: string, cursor: number) {
    await client.query(`UPDATE canonical_project_history_entries SET retired_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND sequence>$4 AND retired_at IS NULL`,[id,scope.tenantId,scope.userId,cursor]);
  }
}

function conflict(code:string,message:string){return Object.assign(new Error(message),{status:409,code});}
