import type { Pool, PoolClient } from 'pg';
import type { AnyLocalExecutionAdmissionDecision, AnyLocalExecutionTicket, LocalExecutionAdmissionReason } from '../../../src/platform/creative/canonical/localExecution.ts';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import { LocalExecutionAdmissionRegistry } from './LocalExecutionAdmission.ts';
import type { LocalExecutionClaimInput, LocalExecutionFinalization, LocalExecutionLedger } from './LocalExecutionLedger.ts';

const TICKET_COLUMNS = 'ticket_id,idempotency_key,tenant_id,user_id,project_id,request_id,workflow_id,step_id,ticket_json,consumed_at,finalized_status,finalized_at';

/** PostgreSQL-backed ticket/replay authority for restart-safe, multi-instance local execution. */
export class PostgresLocalExecutionLedger implements LocalExecutionLedger {
  private readonly heldClaims = new Map<string, PoolClient>();
  private readonly pool: Pool;

  constructor(pool: Pool) { this.pool = pool; }

  async issue(ticket: AnyLocalExecutionTicket): Promise<AnyLocalExecutionTicket> {
    const candidate = validateStoredTicket(ticket);
    const inserted = await this.pool.query(`INSERT INTO local_execution_tickets
      (ticket_id,idempotency_key,tenant_id,user_id,project_id,request_id,workflow_id,step_id,ticket_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      ON CONFLICT DO NOTHING
      RETURNING ${TICKET_COLUMNS}`, [
      candidate.ticketId,
      candidate.idempotencyKey,
      candidate.scope.tenantId,
      candidate.scope.userId,
      candidate.scope.projectId,
      candidate.requestId,
      candidate.workflowId,
      candidate.stepId,
      JSON.stringify(candidate),
    ]);
    if (inserted.rows[0]) return ticketFromRow(inserted.rows[0]);

    const byIdempotency = await this.pool.query(`SELECT ${TICKET_COLUMNS} FROM local_execution_tickets
      WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND idempotency_key=$4`, [candidate.scope.tenantId, candidate.scope.userId, candidate.scope.projectId, candidate.idempotencyKey]);
    if (byIdempotency.rows[0]) return reconcileStoredTicket(byIdempotency.rows[0], candidate);

    const byTicketId = await this.pool.query(`SELECT ${TICKET_COLUMNS} FROM local_execution_tickets WHERE ticket_id=$1`, [candidate.ticketId]);
    if (byTicketId.rows[0]) return reconcileStoredTicket(byTicketId.rows[0], candidate);
    throw new Error('Local execution ticket persistence conflict could not be reconciled');
  }

  async get(ticketId: string): Promise<AnyLocalExecutionTicket | undefined> {
    const result = await this.pool.query(`SELECT ${TICKET_COLUMNS} FROM local_execution_tickets WHERE ticket_id=$1`, [ticketId]);
    return result.rows[0] ? ticketFromRow(result.rows[0]) : undefined;
  }

  async getByIdempotencyKey(scope: Scope, idempotencyKey: string): Promise<AnyLocalExecutionTicket | undefined> {
    const result = await this.pool.query(`SELECT ${TICKET_COLUMNS} FROM local_execution_tickets
      WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND idempotency_key=$4`, [scope.tenantId, scope.userId, scope.projectId, idempotencyKey]);
    return result.rows[0] ? ticketFromRow(result.rows[0]) : undefined;
  }

  async getFinalization(ticketId: string): Promise<LocalExecutionFinalization | undefined> {
    const result = await this.pool.query('SELECT consumed_at, finalized_status, finalized_at FROM local_execution_tickets WHERE ticket_id=$1', [ticketId]);
    const row = result.rows[0];
    if (!row?.consumed_at) return undefined;
    const status = row.finalized_status === 'SUCCESS' || row.finalized_status === 'FAILED' ? row.finalized_status : 'UNKNOWN';
    return Object.freeze({ status, finalizedAt: row.finalized_at instanceof Date ? row.finalized_at.toISOString() : typeof row.finalized_at === 'string' ? row.finalized_at : undefined });
  }

  async claim(input: LocalExecutionClaimInput): Promise<AnyLocalExecutionAdmissionDecision> {
    const client = await this.pool.connect();
    let lockHeld = false;
    let retained = false;
    try {
      const lock = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1, 642)) AS locked', [input.ticketId]);
      lockHeld = lock.rows[0]?.locked === true;
      if (!lockHeld) return denied('IN_PROGRESS');

      const stored = await client.query(`SELECT ${TICKET_COLUMNS} FROM local_execution_tickets WHERE ticket_id=$1`, [input.ticketId]);
      const row = stored.rows[0];
      if (!row) return denied('UNKNOWN_TICKET');
      if (row.consumed_at) return denied('REPLAYED_TICKET');

      const ticket = ticketFromRow(row);
      const validator = new LocalExecutionAdmissionRegistry();
      validator.issue(ticket);
      const decision = validator.claim(input);
      if (!decision.allowed) return decision;
      if (this.heldClaims.has(input.ticketId)) return denied('IN_PROGRESS');
      this.heldClaims.set(input.ticketId, client);
      retained = true;
      return decision;
    } finally {
      if (!retained) {
        if (lockHeld) await unlock(client, input.ticketId).catch(() => undefined);
        client.release();
      }
    }
  }

  async commit(ticketId: string, status: 'SUCCESS' | 'FAILED'): Promise<void> {
    const client = this.heldClaims.get(ticketId);
    if (!client) throw new Error('Local execution ticket has no active PostgreSQL admission claim');
    try {
      const result = await client.query(`UPDATE local_execution_tickets
        SET consumed_at=CURRENT_TIMESTAMP, finalized_status=$2, finalized_at=CURRENT_TIMESTAMP
        WHERE ticket_id=$1 AND consumed_at IS NULL
        RETURNING ticket_id`, [ticketId, status]);
      if (result.rowCount !== 1) throw new Error('Local execution ticket is already consumed or missing');
    } finally {
      this.heldClaims.delete(ticketId);
      await unlock(client, ticketId).catch(() => undefined);
      client.release();
    }
  }

  async release(ticketId: string): Promise<void> {
    const client = this.heldClaims.get(ticketId);
    if (!client) return;
    this.heldClaims.delete(ticketId);
    try { await unlock(client, ticketId); } finally { client.release(); }
  }
}

function validateStoredTicket(ticket: AnyLocalExecutionTicket): AnyLocalExecutionTicket {
  const validator = new LocalExecutionAdmissionRegistry();
  return validator.issue(ticket);
}

function ticketFromRow(row: Record<string, unknown>): AnyLocalExecutionTicket {
  const ticket = validateStoredTicket(row.ticket_json as AnyLocalExecutionTicket);
  if (
    row.ticket_id !== ticket.ticketId ||
    row.idempotency_key !== ticket.idempotencyKey ||
    row.tenant_id !== ticket.scope.tenantId ||
    row.user_id !== ticket.scope.userId ||
    row.project_id !== ticket.scope.projectId ||
    row.request_id !== ticket.requestId ||
    row.workflow_id !== ticket.workflowId ||
    row.step_id !== ticket.stepId
  ) throw new Error('Local execution ticket ledger row does not match its durable authority fields');
  return ticket;
}

function reconcileStoredTicket(row: Record<string, unknown>, candidate: AnyLocalExecutionTicket): AnyLocalExecutionTicket {
  const stored = ticketFromRow(row);
  if (!sameAuthorityBinding(stored, candidate)) throw new Error('Local execution idempotency key already bound to another execution');
  return stored;
}

function sameAuthorityBinding(a: AnyLocalExecutionTicket, b: AnyLocalExecutionTicket): boolean {
  if (a.version !== b.version) return false;
  const common = a.issuer === b.issuer && a.idempotencyKey === b.idempotencyKey &&
    a.requestId === b.requestId && a.workflowId === b.workflowId && a.stepId === b.stepId &&
    canonicalJson(a.scope) === canonicalJson(b.scope) && canonicalJson(a.operation) === canonicalJson(b.operation) &&
    canonicalJson(a.inputs) === canonicalJson(b.inputs) && canonicalJson(a.expectedOutputs) === canonicalJson(b.expectedOutputs) &&
    a.policy === b.policy && canonicalJson(a.cost) === canonicalJson(b.cost);
  if (!common) return false;
  if (a.version === '1' && b.version === '1') return canonicalJson(a.allowedModels) === canonicalJson(b.allowedModels);
  if (a.version === '2' && b.version === '2') return canonicalJson(a.allowedExecutors) === canonicalJson(b.allowedExecutors);
  return false;
}

function canonicalJson(value: unknown): string | undefined { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)]));
}

function denied(reasonCode: Exclude<LocalExecutionAdmissionReason, 'ADMITTED'>): AnyLocalExecutionAdmissionDecision {
  return Object.freeze({ allowed: false, reasonCode });
}

async function unlock(client: PoolClient, ticketId: string): Promise<void> {
  await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 642))', [ticketId]);
}
