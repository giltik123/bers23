import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const TABLE = 'canonical_fashion_garment_warp_layers';
const MIGRATION = '029_fashion_garment_warp_layers.sql';
const COLUMNS = Object.freeze([
  ['layer_id','uuid'],['tenant_id','text'],['user_id','text'],['project_id','uuid'],['execution_id','text'],['ticket_id','text'],
  ['project_image_storage_id','uuid'],['project_image_sha256','bpchar'],['garment_id','uuid'],['view_id','uuid'],['view_content_sha256','bpchar'],
  ['representation_id','uuid'],['representation_content_sha256','bpchar'],['anchor_set_id','uuid'],['anchor_payload_sha256','bpchar'],
  ['destination_mesh_sha256','bpchar'],['tool_id','text'],['tool_version','text'],['width','int4'],['height','int4'],['encoding','text'],
  ['content_sha256','bpchar'],['rgba_bytes','bytea'],['created_at','timestamptz'],
] as const);
const HASH_COLUMNS = Object.freeze(['project_image_sha256','view_content_sha256','representation_content_sha256','anchor_payload_sha256','destination_mesh_sha256','content_sha256'] as const);
const HASH_COLUMN_SET = new Set<string>(HASH_COLUMNS);
const KEYS = Object.freeze(new Map([
  ['canonical_fashion_garment_warp_layers_pkey','PRIMARY KEY (layer_id)'],
  ['canonical_fashion_garment_warp_layers_execution_unique','UNIQUE (tenant_id, user_id, project_id, execution_id)'],
  ['canonical_garment_representations_warp_evidence_unique','UNIQUE (representation_id, garment_id, tenant_id, user_id, content_sha256)'],
  ['canonical_project_body_anchor_sets_warp_evidence_unique','UNIQUE (anchor_set_id, project_id, tenant_id, user_id, anchor_payload_sha256)'],
]));
const FKS = Object.freeze(new Map([
  ['canonical_fashion_garment_warp_layers_garment_fkey','FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments(garment_id, tenant_id, user_id) ON DELETE RESTRICT'],
  ['canonical_fashion_garment_warp_layers_view_evidence_fkey','FOREIGN KEY (view_id, garment_id, tenant_id, user_id, view_content_sha256) REFERENCES canonical_garment_views(view_id, garment_id, tenant_id, user_id, content_sha256) ON DELETE RESTRICT'],
  ['canonical_fashion_garment_warp_layers_representation_evidence_fkey','FOREIGN KEY (representation_id, garment_id, tenant_id, user_id, representation_content_sha256) REFERENCES canonical_garment_representations(representation_id, garment_id, tenant_id, user_id, content_sha256) ON DELETE RESTRICT'],
  ['canonical_fashion_garment_warp_layers_anchor_evidence_fkey','FOREIGN KEY (anchor_set_id, project_id, tenant_id, user_id, anchor_payload_sha256) REFERENCES canonical_project_body_anchor_sets(anchor_set_id, project_id, tenant_id, user_id, anchor_payload_sha256) ON DELETE RESTRICT'],
  ['canonical_fashion_garment_warp_layers_project_image_fkey','FOREIGN KEY (project_image_storage_id) REFERENCES canonical_image_artifacts(storage_id) ON DELETE RESTRICT'],
]));

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', MIGRATION), 'utf8'); }
}
const canon = (value: unknown) => String(value ?? '').replace(/\s+/g,' ').replace(/"/g,'').trim();
const hasBound = (definition:string,expression:string,min:number,max:number) => {
  const d=canon(definition);
  return d.includes(`${expression} BETWEEN ${min} AND ${max}`)
    || (d.includes(`${expression} >= ${min}`) && d.includes(`${expression} <= ${max}`));
};

async function ready(pool: Pool): Promise<boolean> {
  const relation = await pool.query(`SELECT to_regclass($1)::text AS relation`, [TABLE]);
  if (!relation.rows[0]?.relation) return false;

  const columns = await pool.query(`SELECT column_name,udt_name,is_nullable,character_maximum_length,column_default
    FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1`, [TABLE]);
  const byName = new Map(columns.rows.map((row:any)=>[String(row.column_name),row]));
  if (byName.size !== COLUMNS.length) return false;
  for (const [name,type] of COLUMNS) {
    const row:any=byName.get(name);
    if(!row || row.udt_name!==type || row.is_nullable!=='NO') return false;
    if(HASH_COLUMN_SET.has(name) && Number(row.character_maximum_length)!==64) return false;
    const d=String(row.column_default??'').trim();
    if(name==='created_at') { if(!/^(CURRENT_TIMESTAMP|now\(\))$/i.test(d)) return false; }
    else if(d) return false;
  }

  const constraints = await pool.query(`SELECT c.conname,c.contype,c.convalidated,pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c WHERE c.conrelid IN (to_regclass($1),to_regclass('canonical_garment_representations'),to_regclass('canonical_project_body_anchor_sets'))`, [TABLE]);
  const byConstraint=new Map(constraints.rows.map((row:any)=>[String(row.conname),row]));
  for(const [name,definition] of KEYS){const row:any=byConstraint.get(name);if(!row||!row.convalidated||canon(row.definition)!==definition)return false;}
  for(const [name,definition] of FKS){const row:any=byConstraint.get(name);if(!row||row.contype!=='f'||!row.convalidated||canon(row.definition)!==definition)return false;}

  const execution:any=byConstraint.get('canonical_fashion_garment_warp_layers_execution_check');
  const ticket:any=byConstraint.get('canonical_fashion_garment_warp_layers_ticket_check');
  const executionDef=canon(execution?.definition),ticketDef=canon(ticket?.definition);
  if(!execution||execution.contype!=='c'||!execution.convalidated||!hasBound(executionDef,'char_length(execution_id)',1,200)||!executionDef.includes('execution_id = btrim(execution_id)')||!executionDef.includes("execution_id !~ '[[:cntrl:]]'::text"))return false;
  if(!ticket||ticket.contype!=='c'||!ticket.convalidated||!hasBound(ticketDef,'char_length(ticket_id)',1,200)||!ticketDef.includes('ticket_id = btrim(ticket_id)')||!ticketDef.includes("ticket_id !~ '[[:cntrl:]]'::text"))return false;

  const hashes:any=byConstraint.get('canonical_fashion_garment_warp_layers_hashes_check');const hashesDef=canon(hashes?.definition);
  if(!hashes||hashes.contype!=='c'||!hashes.convalidated||HASH_COLUMNS.some(name=>!hashesDef.includes(`${name} ~ '^[0-9a-f]{64}$'::text`)))return false;
  const tool:any=byConstraint.get('canonical_fashion_garment_warp_layers_tool_check');const toolDef=canon(tool?.definition);
  if(!tool||tool.contype!=='c'||!tool.convalidated||!toolDef.includes("tool_id = 'garment-mesh-warp'::text")||!toolDef.includes("tool_version = '1'::text")||/\bOR\b/i.test(toolDef))return false;
  const geometry:any=byConstraint.get('canonical_fashion_garment_warp_layers_geometry_check');const geometryDef=canon(geometry?.definition);
  if(!geometry||geometry.contype!=='c'||!geometry.convalidated||!hasBound(geometryDef,'width',1,4096)||!hasBound(geometryDef,'height',1,4096)||!geometryDef.includes('<= 8388608'))return false;
  const payload:any=byConstraint.get('canonical_fashion_garment_warp_layers_payload_check');const payloadDef=canon(payload?.definition);
  if(!payload||payload.contype!=='c'||!payload.convalidated||!payloadDef.includes("encoding = 'RGBA8_RAW_V1'::text")||!payloadDef.includes('octet_length(rgba_bytes)')||!payloadDef.includes('* 4'))return false;

  const index = await pool.query(`SELECT indexdef FROM pg_indexes WHERE schemaname=current_schema() AND tablename=$1 AND indexname='canonical_fashion_garment_warp_layers_owner_project_idx'`, [TABLE]);
  const indexdef=canon(index.rows[0]?.indexdef);
  if(!indexdef.includes('USING btree (tenant_id, user_id, project_id, created_at DESC, layer_id)') || /\bWHERE\b/i.test(indexdef)) return false;

  const triggers = await pool.query(`SELECT t.tgname,t.tgtype,t.tgenabled,p.proname FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE t.tgrelid=to_regclass($1) AND NOT t.tgisinternal`, [TABLE]);
  const tm=new Map(triggers.rows.map((row:any)=>[String(row.tgname),row]));
  const insert:any=tm.get('canonical_fashion_garment_warp_layers_insert_guard');
  const immutable:any=tm.get('canonical_fashion_garment_warp_layers_immutable_guard');
  if(tm.size!==2 || Number(insert?.tgtype)!==7 || insert?.tgenabled!=='O' || insert?.proname!=='canonical_assert_fashion_garment_warp_layer_insert') return false;
  if(Number(immutable?.tgtype)!==27 || immutable?.tgenabled!=='O' || immutable?.proname!=='canonical_fashion_garment_warp_layer_immutable_guard') return false;
  return true;
}

export async function checkGarmentWarpLayerSchema(pool: Pool): Promise<void> {
  if (!await ready(pool)) throw new Error('canonical Fashion garment warp layer schema is incomplete or drifted; apply migration 029');
}
export async function migrateGarmentWarpLayerSchema(pool: Pool): Promise<void> {
  const relation=await pool.query(`SELECT to_regclass($1)::text AS relation`,[TABLE]);
  if(!relation.rows[0]?.relation) await pool.query(await migration());
  await checkGarmentWarpLayerSchema(pool);
}
