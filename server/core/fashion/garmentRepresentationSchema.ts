import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Pool } from 'pg';

const MIGRATION = '026_managed_garment_representations.sql';
type ColumnContract = Readonly<{ table: string; name: string; udt: string; nullable: boolean; defaultKind: 'none'|'timestamp'|'exact'; expectedDefault?: string; maxLength?: number }>;
type IndexContract = Readonly<{ columns: readonly string[]; options: readonly number[] }>;

const C: readonly ColumnContract[] = Object.freeze([
  ['canonical_garment_representations','representation_id','uuid',false,'none'],
  ['canonical_garment_representations','garment_id','uuid',false,'none'],
  ['canonical_garment_representations','tenant_id','text',false,'none'],
  ['canonical_garment_representations','user_id','text',false,'none'],
  ['canonical_garment_representations','tier','text',false,'none'],
  ['canonical_garment_representations','format','text',false,'none'],
  ['canonical_garment_representations','content_type','text',false,'none'],
  ['canonical_garment_representations','content_sha256','bpchar',false,'none',undefined,64],
  ['canonical_garment_representations','byte_size','int8',false,'none'],
  ['canonical_garment_representations','storage_backend','text',false,'exact',"'POSTGRES_BYTEA_V1'::text"],
  ['canonical_garment_representations','representation_bytes','bytea',false,'none'],
  ['canonical_garment_representations','basis_view_id','uuid',false,'none'],
  ['canonical_garment_representations','source_count','int4',false,'none'],
  ['canonical_garment_representations','generator_id','text',false,'none'],
  ['canonical_garment_representations','generator_version','text',false,'none'],
  ['canonical_garment_representations','validator_id','text',false,'none'],
  ['canonical_garment_representations','validator_version','text',false,'none'],
  ['canonical_garment_representations','admission_state','text',false,'exact',"'ADMITTED'::text"],
  ['canonical_garment_representations','admitted_at','timestamptz',false,'timestamp'],
  ['canonical_garment_representations','revoked_at','timestamptz',true,'none'],
  ['canonical_garment_representation_sources','representation_id','uuid',false,'none'],
  ['canonical_garment_representation_sources','garment_id','uuid',false,'none'],
  ['canonical_garment_representation_sources','tenant_id','text',false,'none'],
  ['canonical_garment_representation_sources','user_id','text',false,'none'],
  ['canonical_garment_representation_sources','source_position','int4',false,'none'],
  ['canonical_garment_representation_sources','view_id','uuid',false,'none'],
  ['canonical_garment_representation_sources','source_content_sha256','bpchar',false,'none',undefined,64],
  ['canonical_garment_representation_sources','created_at','timestamptz',false,'timestamp'],
].map(([table,name,udt,nullable,defaultKind,expectedDefault,maxLength]) => Object.freeze({ table, name, udt, nullable, defaultKind, expectedDefault, maxLength })) as any);

const TIER = ['PARAMETRIC','FULL_3D'] as const;
const FORMAT = ['BERS_PARAMETRIC_V1','GLB_2_0'] as const;
const STATE = ['ADMITTED','REVOKED'] as const;
const CHECKS = Object.freeze({
  canonical_garment_representations_format_content_check: "CHECK ((tier='PARAMETRIC' AND format='BERS_PARAMETRIC_V1' AND content_type='application/vnd.bers.garment-parametric+json') OR (tier='FULL_3D' AND format='GLB_2_0' AND content_type='model/gltf-binary'))",
  canonical_garment_representations_sha_check: "CHECK (content_sha256 ~ '^[0-9a-f]{64}$')",
  canonical_garment_representations_payload_check: 'CHECK (byte_size >= 1 AND byte_size <= 67108864 AND octet_length(representation_bytes) = byte_size)',
  canonical_garment_representations_storage_check: "CHECK (storage_backend='POSTGRES_BYTEA_V1')",
  canonical_garment_representations_source_count_check: 'CHECK (source_count >= 1 AND source_count <= 32)',
  canonical_garment_representations_generator_id_check: "CHECK (char_length(generator_id) >= 1 AND char_length(generator_id) <= 100 AND generator_id=btrim(generator_id) AND generator_id !~ '[[:cntrl:]]')",
  canonical_garment_representations_generator_version_check: "CHECK (char_length(generator_version) >= 1 AND char_length(generator_version) <= 100 AND generator_version=btrim(generator_version) AND generator_version !~ '[[:cntrl:]]')",
  canonical_garment_representations_validator_id_check: "CHECK (char_length(validator_id) >= 1 AND char_length(validator_id) <= 100 AND validator_id=btrim(validator_id) AND validator_id !~ '[[:cntrl:]]')",
  canonical_garment_representations_validator_version_check: "CHECK (char_length(validator_version) >= 1 AND char_length(validator_version) <= 100 AND validator_version=btrim(validator_version) AND validator_version !~ '[[:cntrl:]]')",
  canonical_garment_representations_state_time_check: "CHECK ((admission_state='ADMITTED' AND revoked_at IS NULL) OR (admission_state='REVOKED' AND revoked_at IS NOT NULL))",
  canonical_garment_representation_sources_position_check: 'CHECK (source_position >= 0 AND source_position < 32)',
  canonical_garment_representation_sources_sha_check: "CHECK (source_content_sha256 ~ '^[0-9a-f]{64}$')",
});
const KEYS = Object.freeze({
  canonical_garment_representations_pkey: 'PRIMARY KEY (representation_id)',
  canonical_garment_representations_owner_unique: 'UNIQUE (representation_id, garment_id, tenant_id, user_id)',
  canonical_garment_representations_garment_content_unique: 'UNIQUE (garment_id, content_sha256)',
  canonical_garment_representation_sources_pkey: 'PRIMARY KEY (representation_id, source_position)',
  canonical_garment_representation_sources_view_unique: 'UNIQUE (representation_id, view_id)',
  canonical_garment_views_representation_source_unique: 'UNIQUE (view_id, garment_id, tenant_id, user_id, content_sha256)',
});
const FKS = Object.freeze({
  canonical_garment_representations_garment_owner_fkey: ['canonical_garments','r','FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments(garment_id, tenant_id, user_id)%ON DELETE RESTRICT%'],
  canonical_garment_representations_basis_view_fkey: ['canonical_garment_views','r','FOREIGN KEY (basis_view_id, garment_id, tenant_id, user_id) REFERENCES canonical_garment_views(view_id, garment_id, tenant_id, user_id)%ON DELETE RESTRICT%'],
  canonical_garment_representation_sources_representation_fkey: ['canonical_garment_representations','c','FOREIGN KEY (representation_id, garment_id, tenant_id, user_id) REFERENCES canonical_garment_representations(representation_id, garment_id, tenant_id, user_id)%ON DELETE CASCADE%'],
  canonical_garment_representation_sources_view_evidence_fkey: ['canonical_garment_views','r','FOREIGN KEY (view_id, garment_id, tenant_id, user_id, source_content_sha256) REFERENCES canonical_garment_views(view_id, garment_id, tenant_id, user_id, content_sha256)%ON DELETE RESTRICT%'],
} as const);
const TRIGGERS = Object.freeze({
  canonical_garment_representations_immutable_guard: ['canonical_garment_representation_immutable_guard','14621331405e951de137b8b63ab6ae83',false,31],
  canonical_garment_representation_sources_immutable_guard: ['canonical_garment_representation_source_immutable_guard','b63b5db873f933ce083d757f3e8bace6',false,31],
  canonical_garment_representations_source_set_check: ['canonical_assert_garment_representation_sources','de3d4780d8bff7f25c9efa4d94932f8c',true,21],
  canonical_garment_representation_sources_source_set_check: ['canonical_assert_garment_representation_sources','de3d4780d8bff7f25c9efa4d94932f8c',true,21],
  canonical_garments_representation_summary_check: ['canonical_assert_garment_representation_summary','ec3728bdc04feed85b207c5d549d8890',true,21],
  canonical_garment_representations_summary_check: ['canonical_assert_garment_representation_summary','ec3728bdc04feed85b207c5d549d8890',true,21],
} as const);
const INDEXES: Readonly<Record<string,IndexContract>> = Object.freeze({
  canonical_garment_representations_owner_garment_idx: { columns: ['tenant_id','user_id','garment_id','admission_state','tier','admitted_at','representation_id'], options: [0,0,0,0,0,3,0] },
  canonical_garment_representation_sources_owner_idx: { columns: ['tenant_id','user_id','garment_id','representation_id','source_position'], options: [0,0,0,0,0] },
  canonical_garment_representation_sources_view_idx: { columns: ['tenant_id','user_id','view_id','representation_id'], options: [0,0,0,0] },
});

async function migration(): Promise<string> {
  try { return await readFile(new URL(`./migrations/${MIGRATION}`, import.meta.url), 'utf8'); }
  catch { return readFile(resolve(process.cwd(), 'server/core/fashion/migrations', MIGRATION), 'utf8'); }
}
const canon = (v: unknown) => String(v ?? '').toLowerCase().replace(/::(?:text|bigint|integer)/g,'').replace(/"/g,'').replace(/\s+/g,'').replace(/[()]/g,'');
const exact = (a: unknown,b: string) => canon(a)===canon(b);
function enumReady(def: unknown,column: string,values: readonly string[]): boolean {
  const raw=String(def??''); if(!raw.startsWith('CHECK (')||/\b(?:NOT|OR|AND)\b/i.test(raw)) return false;
  const normalized=raw.toLowerCase().replace(/"/g,'').replace(/\s+/g,'');
  const ops=normalized.match(/<>|!=|<=|>=|=|<|>/g)??[];
  const quoted=[...raw.matchAll(/'([^']+)'::text/g)].map(m=>m[1]);
  return normalized.includes(`${column}=any(array[`)&&ops.length===1&&ops[0]==='='&&quoted.length===values.length&&quoted.every(v=>values.includes(v))&&values.every(v=>quoted.includes(v));
}
function defaultReady(actual: unknown,c: ColumnContract): boolean {
  const v=String(actual??'').trim(); if(c.defaultKind==='none') return !v; if(c.defaultKind==='exact') return v===c.expectedDefault;
  const n=v.toLowerCase().replace(/\s+/g,''); return n==='current_timestamp'||n==='now()';
}

async function failures(pool: Pool): Promise<readonly string[]> {
  const out:string[]=[];
  const tables=await pool.query(`SELECT to_regclass('canonical_garment_representations')::text AS r,to_regclass('canonical_garment_representation_sources')::text AS s`);
  if(!tables.rows[0]?.r) out.push('representations_table'); if(!tables.rows[0]?.s) out.push('sources_table');
  const cols=await pool.query(`SELECT table_name,column_name,udt_name,is_nullable,character_maximum_length,column_default FROM information_schema.columns WHERE table_schema=current_schema() AND table_name IN ('canonical_garment_representations','canonical_garment_representation_sources')`);
  const cm=new Map(cols.rows.map((r:any)=>[`${r.table_name}.${r.column_name}`,r]));
  if(!C.every(c=>{const r:any=cm.get(`${c.table}.${c.name}`);return r&&r.udt_name===c.udt&&((r.is_nullable==='YES')===c.nullable)&&(c.maxLength===undefined||Number(r.character_maximum_length)===c.maxLength)&&defaultReady(r.column_default,c)})) out.push('columns');

  const cons=await pool.query(`SELECT c.conname,c.contype,c.convalidated,c.condeferrable,c.condeferred,c.confdeltype,cr.relname AS ref_table,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c LEFT JOIN pg_class cr ON cr.oid=c.confrelid WHERE c.conrelid IN (to_regclass('canonical_garment_representations'),to_regclass('canonical_garment_representation_sources'),to_regclass('canonical_garment_views'))`);
  const km=new Map(cons.rows.map((r:any)=>[r.conname,r]));
  for(const [name,definition] of Object.entries(KEYS)){const r:any=km.get(name);if(!r||!r.convalidated||r.definition!==definition)out.push(name)}
  const tier:any=km.get('canonical_garment_representations_tier_check'); if(!tier||!tier.convalidated||!enumReady(tier.definition,'tier',TIER)) out.push('tier_check');
  const format:any=km.get('canonical_garment_representations_format_check'); if(!format||!format.convalidated||!enumReady(format.definition,'format',FORMAT)) out.push('format_check');
  const state:any=km.get('canonical_garment_representations_state_check'); if(!state||!state.convalidated||!enumReady(state.definition,'admission_state',STATE)) out.push('state_check');
  for(const [name,definition] of Object.entries(CHECKS)){const r:any=km.get(name);if(!r||!r.convalidated||!exact(r.definition,definition))out.push(name)}
  for(const [name,[ref,del,pattern]] of Object.entries(FKS)){const r:any=km.get(name);const d=String(r?.definition??'').replace(/"/g,'');if(!r||r.contype!=='f'||!r.convalidated||r.ref_table!==ref||r.confdeltype!==del||!like(d,pattern))out.push(name)}

  const tr=await pool.query(`SELECT t.tgname,t.tgdeferrable,t.tginitdeferred,t.tgenabled,t.tgconstraint<>0 AS is_constraint,t.tgtype,p.proname,md5(p.prosrc) AS body_md5,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal AND t.tgname=ANY($1::text[])`,[Object.keys(TRIGGERS)]);
  const tm=new Map(tr.rows.map((r:any)=>[r.tgname,r]));
  for(const [name,[fn,md5,constraint,type]] of Object.entries(TRIGGERS)){const r:any=tm.get(name);const d=String(r?.definition??'').toLowerCase();if(!r||r.tgenabled!=='O'||r.proname!==fn||r.body_md5!==md5||r.is_constraint!==constraint||Number(r.tgtype)!==type||(constraint&&(!r.tgdeferrable||!r.tginitdeferred))||(!constraint&&(r.tgdeferrable||r.tginitdeferred))||!d.includes('for each row')||!d.includes(`execute function ${fn}()`))out.push(name)}

  const ix=await pool.query(`SELECT ic.relname,i.indisvalid,i.indisready,i.indisunique,i.indisprimary,am.amname,i.indpred IS NOT NULL AS partial,i.indexprs IS NOT NULL AS expressions,ARRAY(SELECT a.attname FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum WHERE k.ord<=i.indnkeyatts ORDER BY k.ord) AS columns,ARRAY(SELECT o.option FROM unnest(i.indoption::smallint[]) WITH ORDINALITY o(option,ord) WHERE o.ord<=i.indnkeyatts ORDER BY o.ord) AS options FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_am am ON am.oid=ic.relam WHERE ic.relname=ANY($1::text[])`,[Object.keys(INDEXES)]);
  const im=new Map(ix.rows.map((r:any)=>[r.relname,r]));
  for(const [name,e] of Object.entries(INDEXES)){const r:any=im.get(name);if(!r||!r.indisvalid||!r.indisready||r.indisunique||r.indisprimary||r.amname!=='btree'||r.partial||r.expressions||!same(r.columns,e.columns)||!same((r.options??[]).map(Number),e.options))out.push(name)}
  return Object.freeze(out);
}
function same(a: readonly unknown[]|undefined,b: readonly unknown[]):boolean{return Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>String(v)===String(b[i]))}
function like(value:string,pattern:string):boolean{const parts=pattern.split('%');let at=0;for(const part of parts){if(!part)continue;const next=value.indexOf(part,at);if(next<0)return false;at=next+part.length}return true}

export async function checkGarmentRepresentationSchema(pool: Pool): Promise<void> { const f=await failures(pool); if(f.length) throw new Error(`canonical Garment representation schema is not ready: ${f.join(', ')}`); }
export async function migrateGarmentRepresentationSchema(pool: Pool): Promise<void> { try{await checkGarmentRepresentationSchema(pool);return}catch{} await pool.query(await migration()); await checkGarmentRepresentationSchema(pool); }
