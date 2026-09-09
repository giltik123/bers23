import type { Pool } from 'pg';
import type { AdmittedPlanGraphV1 } from './AeePlanCompilerV1.ts';
import {
  normalizeAeeAdmittedPlanGraphV1,
  serializeAeeAdmittedPlanGraphV1,
} from './AeeAdmittedPlanCodecV1.ts';

export type AeeAdmittedPlanScope = Readonly<{
  tenantId: string;
  userId: string;
  projectId: string;
}>;

export type AeeAdmittedPlanRecord = Readonly<{
  scope: AeeAdmittedPlanScope;
  graph: AdmittedPlanGraphV1;
  createdAt: string;
}>;

export class PostgresAeeAdmittedPlanStore {
  constructor(private readonly pool: Pool) {}

  async put(scopeInput: AeeAdmittedPlanScope, rawGraph: unknown): Promise<AeeAdmittedPlanRecord> {
    const scope = normalizeScope(scopeInput);
    const graph = normalizeAeeAdmittedPlanGraphV1(rawGraph);
    if (graph.source.projectId !== scope.projectId) {
      throw planStoreError('aee_admitted_plan_cross_project', 'Admitted graph Project does not match durable store scope');
    }
    const canonicalJson = serializeAeeAdmittedPlanGraphV1(graph);
    const result = await this.pool.query(`INSERT INTO aee_admitted_plan_graphs
      (tenant_id,user_id,project_id,graph_digest,schema_version,compiler_version,capability_registry_version,capability_registry_digest,intent_digest,proposal_digest,graph_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      ON CONFLICT (tenant_id,user_id,project_id,graph_digest) DO NOTHING
      RETURNING *`, [
      scope.tenantId,
      scope.userId,
      scope.projectId,
      graph.digest,
      graph.schemaVersion,
      graph.compilerVersion,
      graph.capabilityRegistry.version,
      graph.capabilityRegistry.digest,
      graph.intentDigest,
      graph.proposalDigest,
      canonicalJson,
    ]);
    if (result.rows[0]) return fromRow(result.rows[0]);

    const existing = await this.get(scope, graph.digest);
    if (!existing) throw planStoreError('aee_admitted_plan_persistence_conflict', 'Admitted plan persistence conflict could not be reconciled');
    if (serializeAeeAdmittedPlanGraphV1(existing.graph) !== canonicalJson) {
      throw planStoreError('aee_admitted_plan_digest_collision', 'Existing admitted-plan digest is bound to different canonical bytes');
    }
    return existing;
  }

  async get(scopeInput: AeeAdmittedPlanScope, graphDigestInput: string): Promise<AeeAdmittedPlanRecord | undefined> {
    const scope = normalizeScope(scopeInput);
    const graphDigest = sha256(graphDigestInput, 'graphDigest');
    const result = await this.pool.query(`SELECT * FROM aee_admitted_plan_graphs
      WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND graph_digest=$4`,
    [scope.tenantId, scope.userId, scope.projectId, graphDigest]);
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }
}

function fromRow(row: any): AeeAdmittedPlanRecord {
  const scope = normalizeScope({
    tenantId: row.tenant_id,
    userId: row.user_id,
    projectId: row.project_id,
  });
  const graph = normalizeAeeAdmittedPlanGraphV1(row.graph_json);
  if (graph.digest !== String(row.graph_digest)
    || graph.schemaVersion !== String(row.schema_version)
    || graph.compilerVersion !== String(row.compiler_version)
    || graph.capabilityRegistry.version !== Number(row.capability_registry_version)
    || graph.capabilityRegistry.digest !== String(row.capability_registry_digest)
    || graph.intentDigest !== String(row.intent_digest)
    || graph.proposalDigest !== String(row.proposal_digest)
    || graph.source.projectId !== scope.projectId) {
    throw planStoreError('aee_admitted_plan_row_binding_invalid', 'Durable admitted-plan metadata differs from canonical graph body');
  }
  return Object.freeze({
    scope,
    graph,
    createdAt: new Date(row.created_at).toISOString(),
  });
}

function normalizeScope(raw: AeeAdmittedPlanScope): AeeAdmittedPlanScope {
  if (!raw || typeof raw !== 'object') throw planStoreError('aee_admitted_plan_scope_invalid', 'Admitted-plan scope is required');
  return Object.freeze({
    tenantId: token(raw.tenantId, 'tenantId', 256),
    userId: token(raw.userId, 'userId', 256),
    projectId: token(raw.projectId, 'projectId', 256),
  });
}

function token(raw: unknown, path: string, max: number): string {
  if (typeof raw !== 'string') throw planStoreError('aee_admitted_plan_scope_invalid', `${path} must be a string`);
  const value = raw.trim();
  if (!value || Buffer.byteLength(value, 'utf8') > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw planStoreError('aee_admitted_plan_scope_invalid', `${path} is invalid`);
  }
  return value;
}

function sha256(raw: unknown, path: string): string {
  if (typeof raw !== 'string') throw planStoreError('aee_admitted_plan_digest_invalid', `${path} must be a string`);
  const value = raw.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(value)) throw planStoreError('aee_admitted_plan_digest_invalid', `${path} must be SHA-256 hex`);
  return value;
}

function planStoreError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}
