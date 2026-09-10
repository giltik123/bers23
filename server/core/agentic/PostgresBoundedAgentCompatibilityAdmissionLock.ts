import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';

const ADMISSION_LOCK_DOMAIN = 'bers:aee:bounded-compatibility-admission:v1\0';

/**
 * Narrow concurrency primitive for AE-4c.2. It serializes only the same
 * authenticated (Project, clientRequestId) admission key, then holds a shared
 * lock on the canonical Project row while the caller reads currentSourceContext,
 * persists the admitted graph and creates the durable workflow continuation.
 *
 * The row query intentionally reads no revision/source authority; those values
 * still come only from PostgresProjectStore.currentSourceContext(). This class
 * owns neither Project mutation nor workflow/plan/Artifact/provider/Billing state.
 */
export class PostgresBoundedAgentCompatibilityAdmissionLock {
  constructor(private readonly pool: Pool) {}

  async withClientRequestLock<T>(scopeInput: Scope, clientRequestIdInput: string, work: () => Promise<T>): Promise<T> {
    const scope = normalizeScope(scopeInput);
    const clientRequestId = token(clientRequestIdInput, 'clientRequestId');
    const lockKey = advisoryKey(scope, clientRequestId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [lockKey.toString()]);
      const project = await client.query(`SELECT project_id FROM canonical_projects
        WHERE project_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL
        FOR SHARE`, [scope.projectId, scope.tenantId, scope.userId]);
      if (!project.rows[0]) throw notFound('Project not found');
      const result = await work();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

function advisoryKey(scope: Scope, clientRequestId: string): bigint {
  const digest = createHash('sha256')
    .update(ADMISSION_LOCK_DOMAIN)
    .update(scope.tenantId).update('\0')
    .update(scope.userId).update('\0')
    .update(scope.projectId).update('\0')
    .update(clientRequestId)
    .digest();
  return BigInt.asIntN(64, digest.readBigUInt64BE(0));
}

function normalizeScope(scope: Scope): Scope {
  return Object.freeze({
    tenantId: token(scope?.tenantId, 'tenantId'),
    userId: token(scope?.userId, 'userId'),
    projectId: token(scope?.projectId, 'projectId'),
  });
}

function token(value: unknown, path: string): string {
  if (typeof value !== 'string') throw lockError(`${path} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized !== value || Buffer.byteLength(normalized, 'utf8') > 256 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw lockError(`${path} is invalid`);
  }
  return normalized;
}

function lockError(message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 400, code: 'bounded_aee_admission_lock_invalid' });
}

function notFound(message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status: 404, code: 'project_not_found' });
}
