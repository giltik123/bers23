import type { Pool, PoolClient } from 'pg';
import type { LocalExecutionAdmissionDecision, LocalExecutionTicket } from '../../../src/platform/creative/canonical/localExecution.ts';
import { LocalExecutionAdmissionRegistry } from './LocalExecutionAdmission.ts';
import type { LocalExecutionClaimInput, LocalExecutionLedger } from './LocalExecutionLedger.ts';

const ADVISORY_LOCK_NAMESPACE = 642;

/** PostgreSQL-backed ticket/replay authority for restart-safe, multi-instance local execution. */
export class PostgresLocalExecutionLedger implements LocalExecutionLedger {
  private readonly heldClaims = new Map<string, PoolClient>();

  constructor(private readonly pool: Pool) {}

  async issue(ticket: LocalExecutionTicket): Promise<LocalExecutionTicket> {
    const candidate = validateStoredTicket(ticket);
    const inserted = await this.pool.query(`INSERT INTO local_execution_tickets
      (ticket_id,idempotency_key,tenant_id,user_id,project_id,request_id,workflow_id,step_id,ticket_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      ON CONFLICT DO NOTHING
      RETURNING ticket_json`, [
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
    if (inserted.rows[0]) return candidate;

    const byIdempotency = await this.pool.query('SELECT ticket_json FROM local_execution_tickets WHERE idempotency_key=$1', [candidate.idempotencyKey]);
    if (byIdempotency.rows[0]) return reconcileStoredTicket(byIdempotency.rows[0].ticket_json, candidate);

    const byTicketId = await this.pool.query('SELECT ticket_json FROM local_execution_tickets WHERE ticket_id=$1', [candidate.ticketId]);
    if (byTicketId.rows[0]) return reconcileStoredTicket(byTicketId.rows[0].ticket_json, candidate);
    throw new Error('Local execution ticket persistence conflict could not be reconciled');
  }

  async get(ticketId: string): Promise<LocalExecutionTicket | undefined> {
    const result = await this.pool.query('SELECT ticket_json FROM local_execution_tickets WHERE ticket_id=$1', [ticketId]);
    return result.rows[0] ? validateStoredTicket(result.rows[0].ticket_json) : undefined;
  }

  async claim(input: LocalExecutionClaimInput): Promise<LocalExecutionAdmissionDecision> {
    const client = await this.pool.connect();
    let lockHeld = false;
    let retained = false;
    try {
      const lock = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1, $2)) AS locked', [input.ticketId, ADVISORY_LOCK_NAMESPACE]);
      lockHeld = lock.rows[0]?.locked === true;
      if (!lockHeld) return denied('IN_PROGRESS');

      const stored = await client.query('SELECT ticket_json, consumed_at FROM local_execution_tickets WHERE ticket_id=$1', [input.ticketId]);
      const row = stored.rows[0];
      if (!row) return denied('UNKNOWN_TICKET');
      if (row.consumed_at) return denied('REPLAYED_TICKET');

      const validator = new LocalExecutionAdmissionRegistry();
      validator.issue(row.ticket_json as LocalExecutionTicket);
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

  async commit(ticketId: string): Promise<void> {
    const client = this.heldClaims.get(ticketId);
    if (!client) throw new Error('Local execution ticket has no active PostgreSQL admission claim');
    try {
      const result = await client.query(`UPDATE local_execution_tickets
        SET consumed_at=CURRENT_TIMESTAMP
        WHERE ticket_id=$1 AND consumed_at IS NULL
        RETURNING ticket_id`, [ticketId]);
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

function validateStoredTicket(ticket: LocalExecutionTicket): LocalExecutionTicket {
  const validator = new LocalExecutionAdmissionRegistry();
  return validator.issue(ticket);
}

function reconcileStoredTicket(existing: unknown, candidate: LocalExecutionTicket): LocalExecutionTicket {
  const validator = new LocalExecutionAdmissionRegistry();
  const stored = validator.issue(existing as LocalExecutionTicket);
  return validator.issue(candidate) === stored ? stored : stored;
}

function denied(reasonCode: Exclude<LocalExecutionAdmissionDecision['reasonCode'], 'ADMITTED'>): LocalExecutionAdmissionDecision {
  return Object.freeze({ allowed: false, reasonCode });
}

async function unlock(client: PoolClient, ticketId: string): Promise<void> {
  await client.query('SELECT pg_advisory_unlock(hashtextextended($1, $2))', [ticketId, ADVISORY_LOCK_NAMESPACE]);
}
