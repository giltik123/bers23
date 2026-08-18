import { immutableCopy } from './immutable';
import type { CreativeLearningRecord } from './types';

export interface LearningScope { tenantId:string; projectId?:string; userId?:string }
export interface CreativeLearningStore { append(record:CreativeLearningRecord):Promise<boolean>; list(scope:LearningScope):Promise<readonly CreativeLearningRecord[]> }
export class MemoryCreativeLearningStore implements CreativeLearningStore {
  private records=new Map<string,CreativeLearningRecord>();
  async append(r:CreativeLearningRecord){if(this.records.has(r.identity))return false;this.records.set(r.identity,immutableCopy(r) as CreativeLearningRecord);return true}
  async list(scope:LearningScope){return immutableCopy([...this.records.values()].filter(r=>r.scope.tenantId===scope.tenantId&&(!scope.projectId||r.scope.projectId===scope.projectId)&&(!scope.userId||r.scope.userId===scope.userId)));}
}

export interface SqlClient { query(text:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[];rowCount?:number|null}>; connect?:()=>Promise<SqlConnection> }
export interface SqlConnection { query:SqlClient['query']; release():void }
export interface PostgresLearningStoreOptions { schema?:string; retentionPolicyVersion?:string; retentionDays?:number; afterInsert?:()=>void|Promise<void> }
const migrationVersion='creative-learning-v2';
const migrationBody=`
CREATE TABLE IF NOT EXISTS creative_learning_records (
 tenant_id text NOT NULL CHECK (length(btrim(tenant_id)) > 0), project_id text NOT NULL CHECK (length(btrim(project_id)) > 0), user_id text NOT NULL CHECK (length(btrim(user_id)) > 0),
 execution_id text NOT NULL CHECK (length(btrim(execution_id)) > 0), outcome_version text NOT NULL CHECK (length(btrim(outcome_version)) > 0), request_id text,
 feature_schema_version text NOT NULL CHECK (length(btrim(feature_schema_version)) > 0), reward_schema_version text NOT NULL CHECK (length(btrim(reward_schema_version)) > 0), retention_policy_version text NOT NULL CHECK (length(btrim(retention_policy_version)) > 0),
 occurred_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT transaction_timestamp(), expires_at timestamptz,
 record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
 CONSTRAINT creative_learning_outcome_identity UNIQUE(tenant_id,project_id,user_id,execution_id,outcome_version),
 CONSTRAINT creative_learning_expiry_valid CHECK (expires_at IS NULL OR expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS creative_learning_scope_time_idx ON creative_learning_records(tenant_id,project_id,user_id,occurred_at);
`;
export const CREATIVE_LEARNING_MIGRATION={version:migrationVersion,checksum:'367f6cef7ddf0a8058ae074de84b9e4d58dd0ffe1f530b3a391fbc0bc67a5908',sql:migrationBody} as const;
const quote=(name:string)=>{if(!/^[a-z_][a-z0-9_]*$/i.test(name))throw new Error('invalid PostgreSQL schema name');return `"${name}"`};

export class PostgresCreativeLearningStore implements CreativeLearningStore {
  private readonly schema:string;
  constructor(private db:SqlClient,private readonly options:PostgresLearningStoreOptions={}){this.schema=quote(options.schema??'public')}
  async migrate(){await this.transaction(async c=>{
    await c.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);await c.query(`SET LOCAL search_path TO ${this.schema}`);await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`bers:${this.schema}:creative-learning`]);
    await c.query('CREATE TABLE IF NOT EXISTS creative_learning_migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT transaction_timestamp())');
    const found=await c.query('SELECT checksum FROM creative_learning_migrations WHERE version=$1',[migrationVersion]);if(found.rows[0]&&found.rows[0].checksum!==CREATIVE_LEARNING_MIGRATION.checksum)throw new Error('creative learning migration checksum mismatch');
    await c.query(migrationBody);await c.query('INSERT INTO creative_learning_migrations(version,checksum) VALUES($1,$2) ON CONFLICT(version) DO NOTHING',[migrationVersion,CREATIVE_LEARNING_MIGRATION.checksum]);
  })}
  async append(r:CreativeLearningRecord){return this.transaction(async c=>{
    const expires=this.options.retentionDays==null?null:new Date(Date.parse(r.occurredAt)+this.options.retentionDays*86400000).toISOString();
    const x=await c.query(`INSERT INTO ${this.schema}.creative_learning_records (tenant_id,project_id,user_id,execution_id,outcome_version,request_id,feature_schema_version,reward_schema_version,retention_policy_version,occurred_at,expires_at,record) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) ON CONFLICT(tenant_id,project_id,user_id,execution_id,outcome_version) DO NOTHING`,[r.scope.tenantId,r.scope.projectId,r.scope.userId,r.executionId,r.outcomeVersion,r.requestId,r.predictions.featureSchemaVersion,r.reward.rewardSchemaVersion,this.options.retentionPolicyVersion??r.retentionPolicyVersion??'v1',r.occurredAt,expires,JSON.stringify(r)]);
    if(x.rowCount===1)await this.options.afterInsert?.();return x.rowCount===1;
  })}
  async list(s:LearningScope){const clauses=['tenant_id=$1'],values:unknown[]=[s.tenantId];if(s.projectId){values.push(s.projectId);clauses.push(`project_id=$${values.length}`)}if(s.userId){values.push(s.userId);clauses.push(`user_id=$${values.length}`)}const x=await this.db.query(`SELECT record,created_at,expires_at,retention_policy_version FROM ${this.schema}.creative_learning_records WHERE ${clauses.join(' AND ')} ORDER BY occurred_at,tenant_id,project_id,user_id,execution_id,outcome_version`,values);return immutableCopy(x.rows.map(row=>({...row.record as CreativeLearningRecord,createdAt:(row.created_at as Date).toISOString(),expiresAt:row.expires_at?(row.expires_at as Date).toISOString():undefined,retentionPolicyVersion:row.retention_policy_version as string}))) as readonly CreativeLearningRecord[]}
  private async transaction<T>(work:(client:SqlClient)=>Promise<T>):Promise<T>{const connection=this.db.connect?await this.db.connect():undefined,client=connection??this.db;await client.query('BEGIN');try{const result=await work(client);await client.query('COMMIT');return result}catch(error){try{await client.query('ROLLBACK')}catch{/* preserve original error */}throw error}finally{connection?.release()}}
}
