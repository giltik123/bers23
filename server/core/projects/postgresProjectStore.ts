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
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO canonical_image_artifacts (storage_id,tenant_id,user_id,project_id,role,lifecycle,width,height,encoding,content_type,image_bytes) VALUES ($1,$2,$3,$4,'ORIGINAL','IMMUTABLE',$5,$6,'PNG_RGBA8_LOSSLESS','image/png',$7)`, [storageId,scope.tenantId,scope.userId,projectId,width,height,png]);
      const historyId=randomUUID();
      await client.query(`INSERT INTO canonical_projects (project_id,tenant_id,user_id,name,original_image_storage_id,current_image_storage_id,width,height) VALUES ($1,$2,$3,$4,$5,$5,$6,$7)`, [projectId,scope.tenantId,scope.userId,name,storageId,width,height]);
      await client.query(`INSERT INTO canonical_project_history(history_id,project_id,tenant_id,user_id,ordinal,source_image_storage_id,image_storage_id,kind) VALUES($1,$2,$3,$4,0,$5,$5,'ORIGINAL')`,[historyId,projectId,scope.tenantId,scope.userId,storageId]);
      await client.query(`UPDATE canonical_projects SET history_cursor_id=$2 WHERE project_id=$1`,[projectId,historyId]);
      const result=await client.query(`SELECT * FROM canonical_projects WHERE project_id=$1`,[projectId]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async list(scope: AuthenticatedScope) { return (await this.pool.query(`SELECT * FROM canonical_projects WHERE tenant_id=$1 AND user_id=$2 AND deleted_at IS NULL ORDER BY updated_at DESC`, [scope.tenantId,scope.userId])).rows; }
  async get(scope: AuthenticatedScope, id: string) { return (await this.pool.query(`SELECT * FROM canonical_projects WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL`, [id,scope.tenantId,scope.userId])).rows[0]; }
  async state(scope: AuthenticatedScope, id: string) { const project=await this.get(scope,id); if(!project)return undefined; const history=(await this.pool.query(`SELECT * FROM canonical_project_history WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND retired_at IS NULL ORDER BY ordinal`,[id,scope.tenantId,scope.userId])).rows; const versions=(await this.pool.query(`SELECT * FROM canonical_project_versions WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL ORDER BY created_at,version_id`,[id,scope.tenantId,scope.userId])).rows; return {...project,history,versions}; }

  /**
   * Project width/height describe the current canvas, not immutable ORIGINAL geometry.
   * Accepting a canonical FINAL may therefore change dimensions (for example x4 SR).
   * History navigation below always restores dimensions from the target artifact.
   */
  async acceptFinal(scope: AuthenticatedScope,id:string,storageId:string,instruction?:string){
    return this.mutate(scope,id,async(client,project)=>{
      const artifact=(await client.query(`SELECT storage_id,width,height,execution_id,operation_id FROM canonical_image_artifacts WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4 AND role='COMPOSITE' AND lifecycle='FINAL' AND revoked_at IS NULL AND deleted_at IS NULL`,[storageId,scope.tenantId,scope.userId,id])).rows[0];
      if(!artifact)throw Object.assign(new Error('FINAL artifact is invalid or unavailable'),{status:400,code:'invalid_final_artifact'});
      const existing=(await client.query(`SELECT history_id FROM canonical_project_history WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND image_storage_id=$4 AND kind='ACCEPTED_FINAL'`,[id,scope.tenantId,scope.userId,storageId])).rows[0];
      if(existing)return;
      const cursor=(await client.query(`SELECT ordinal FROM canonical_project_history WHERE history_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4`,[project.history_cursor_id,id,scope.tenantId,scope.userId])).rows[0];
      await client.query(`UPDATE canonical_project_history SET retired_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND retired_at IS NULL AND ordinal>$4`,[id,scope.tenantId,scope.userId,cursor.ordinal]);
      const historyId=randomUUID();
      await client.query(`INSERT INTO canonical_project_history(history_id,project_id,tenant_id,user_id,ordinal,source_image_storage_id,image_storage_id,kind,instruction,execution_id,operation_id,credits_used) VALUES($1,$2,$3,$4,$5,$6,$7,'ACCEPTED_FINAL',$8,$9,$10,0)`,[historyId,id,scope.tenantId,scope.userId,cursor.ordinal+1,project.current_image_storage_id,storageId,instruction??null,artifact.execution_id,artifact.operation_id]);
      await client.query(`UPDATE canonical_projects SET current_image_storage_id=$2,history_cursor_id=$3,width=$4,height=$5,status='editing',objects='[]',updated_at=CURRENT_TIMESTAMP WHERE project_id=$1`,[id,storageId,historyId,artifact.width,artifact.height]);
    });
  }

  async navigate(scope:AuthenticatedScope,id:string,direction:'undo'|'redo'|'original'){
    return this.mutate(scope,id,async(client,project)=>{
      const cursor=(await client.query(`SELECT ordinal FROM canonical_project_history WHERE history_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4`,[project.history_cursor_id,id,scope.tenantId,scope.userId])).rows[0];
      const clause=direction==='undo'?'h.ordinal<$4 ORDER BY h.ordinal DESC':direction==='redo'?'h.ordinal>$4 ORDER BY h.ordinal ASC':'h.ordinal=0 ORDER BY h.ordinal';
      const params=direction==='original'?[id,scope.tenantId,scope.userId]:[id,scope.tenantId,scope.userId,cursor.ordinal];
      const target=(await client.query(`SELECT h.history_id,h.image_storage_id,a.width,a.height FROM canonical_project_history h JOIN canonical_image_artifacts a ON a.storage_id=h.image_storage_id AND a.tenant_id=h.tenant_id AND a.user_id=h.user_id AND a.project_id=h.project_id WHERE h.project_id=$1 AND h.tenant_id=$2 AND h.user_id=$3 AND h.retired_at IS NULL AND a.revoked_at IS NULL AND a.deleted_at IS NULL AND ((a.role='ORIGINAL' AND a.lifecycle='IMMUTABLE') OR (a.role='COMPOSITE' AND a.lifecycle='FINAL')) AND ${clause} LIMIT 1`,params)).rows[0];
      if(!target)throw Object.assign(new Error(`Cannot ${direction}`),{status:409,code:`cannot_${direction}`});
      await client.query(`UPDATE canonical_projects SET current_image_storage_id=$2,history_cursor_id=$3,width=$4,height=$5,objects='[]',updated_at=CURRENT_TIMESTAMP WHERE project_id=$1`,[id,target.image_storage_id,target.history_id,target.width,target.height]);
    });
  }

  async createVersion(scope:AuthenticatedScope,id:string,name:string){
    if(!name.trim()||name.trim().length>200)throw Object.assign(new Error('Version name is invalid'),{status:400,code:'invalid_version_name'});
    return this.mutate(scope,id,async(client,project)=>{await client.query(`INSERT INTO canonical_project_versions(version_id,project_id,tenant_id,user_id,name,image_storage_id,history_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),id,scope.tenantId,scope.userId,name.trim(),project.current_image_storage_id,project.history_cursor_id]);});
  }

  async restoreVersion(scope:AuthenticatedScope,id:string,versionId:string){
    return this.mutate(scope,id,async(client,project)=>{
      const version=(await client.query(`SELECT name,image_storage_id,history_id FROM canonical_project_versions WHERE version_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4 AND deleted_at IS NULL`,[versionId,id,scope.tenantId,scope.userId])).rows[0];
      if(!version)throw Object.assign(new Error('Version not found'),{status:404,code:'version_not_found'});
      const image=(await client.query(`SELECT storage_id,width,height FROM canonical_image_artifacts WHERE storage_id=$1 AND tenant_id=$2 AND user_id=$3 AND project_id=$4 AND revoked_at IS NULL AND deleted_at IS NULL AND ((role='ORIGINAL' AND lifecycle='IMMUTABLE') OR (role='COMPOSITE' AND lifecycle='FINAL'))`,[version.image_storage_id,scope.tenantId,scope.userId,id])).rows[0];
      if(!image)throw Object.assign(new Error('Version artifact is unavailable'),{status:409,code:'version_artifact_unavailable'});
      const cursor=(await client.query(`SELECT ordinal FROM canonical_project_history WHERE history_id=$1 AND project_id=$2 AND tenant_id=$3 AND user_id=$4`,[project.history_cursor_id,id,scope.tenantId,scope.userId])).rows[0];
      await client.query(`UPDATE canonical_project_history SET retired_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND retired_at IS NULL AND ordinal>$4`,[id,scope.tenantId,scope.userId,cursor.ordinal]);
      const historyId=randomUUID();
      await client.query(`INSERT INTO canonical_project_history(history_id,project_id,tenant_id,user_id,ordinal,source_image_storage_id,image_storage_id,kind,instruction,credits_used) VALUES($1,$2,$3,$4,$5,$6,$7,'RESTORE_VERSION',$8,0)`,[historyId,id,scope.tenantId,scope.userId,cursor.ordinal+1,project.current_image_storage_id,version.image_storage_id,`Restored version "${version.name}"`]);
      await client.query(`UPDATE canonical_projects SET current_image_storage_id=$2,history_cursor_id=$3,width=$4,height=$5,objects='[]',updated_at=CURRENT_TIMESTAMP WHERE project_id=$1`,[id,version.image_storage_id,historyId,image.width,image.height]);
    });
  }

  private async mutate(scope:AuthenticatedScope,id:string,action:(client:any,project:any)=>Promise<void>){const client=await this.pool.connect();try{await client.query('BEGIN');const project=(await client.query(`SELECT * FROM canonical_projects WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL FOR UPDATE`,[id,scope.tenantId,scope.userId])).rows[0];if(!project)throw Object.assign(new Error('Project not found'),{status:404,code:'project_not_found'});await action(client,project);await client.query('COMMIT');return this.state(scope,id);}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}}
  async update(scope: AuthenticatedScope, id: string, patch: Record<string, unknown>) { const allowed = ['name','favorite','archived','status','objects']; const keys = Object.keys(patch); if (!keys.length || keys.some(k => !allowed.includes(k))) throw Object.assign(new Error('Project patch contains unsupported fields'), { status: 400, code: 'invalid_project_patch' }); const values = keys.map(k => k === 'objects' ? JSON.stringify(patch[k]) : patch[k]); const sets = keys.map((k,i) => `${k}=$${i+4}${k === 'objects' ? '::jsonb' : ''}`); return (await this.pool.query(`UPDATE canonical_projects SET ${sets.join(',')},updated_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL RETURNING *`, [id,scope.tenantId,scope.userId,...values])).rows[0]; }
  async delete(scope: AuthenticatedScope, id: string) { const client=await this.pool.connect(); try { await client.query('BEGIN'); const row=(await client.query(`UPDATE canonical_projects SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL RETURNING project_id`,[id,scope.tenantId,scope.userId])).rows[0]; if (row) await client.query(`UPDATE canonical_image_artifacts SET deleted_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3`,[scope.tenantId,scope.userId,id]); await client.query('COMMIT'); return Boolean(row); } catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();} }
}
