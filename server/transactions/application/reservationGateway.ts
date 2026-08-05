import type { ReserveResult } from './ports.ts';
import { TransactionService } from './transactionService.ts';

export type TrustedReservationContext = Readonly<{
  user: Readonly<{ id: string }>;
  project: Readonly<{ id: string; created_by_id: string }>;
  operation: Readonly<{
    operation_id: string;
    version: number;
    provider: string;
    credit_cost: number;
  }>;
}>;

export type ReservationCommand = Readonly<{
  idempotency_key: unknown;
  payload: unknown;
}>;

export interface CorrelationIdGenerator { next(): string }
export interface RequestFingerprinter { fingerprint(value: unknown): Promise<string> }

/**
 * Converts an authorized operation into the narrow 4C.1 reservation command.
 * Financial policy is copied only from the trusted context; the untrusted
 * command contributes an idempotency key and the payload being fingerprinted.
 */
export class ReservationGateway {
  private readonly transactions: TransactionService;
  private readonly correlationIds: CorrelationIdGenerator;
  private readonly fingerprinter: RequestFingerprinter;

  constructor(
    transactions: TransactionService,
    correlationIds: CorrelationIdGenerator,
    fingerprinter: RequestFingerprinter = new Sha256RequestFingerprinter(),
  ) {
    this.transactions = transactions;
    this.correlationIds = correlationIds;
    this.fingerprinter = fingerprinter;
  }

  async reserve(
    context: TrustedReservationContext,
    command: ReservationCommand,
  ): Promise<Extract<ReserveResult, { kind: 'created' | 'replayed' }>> {
    validateContext(context);
    const idempotencyKey = requireIdempotencyKey(command.idempotency_key);
    const requestFingerprint = await this.fingerprinter.fingerprint({
      operation_id: context.operation.operation_id,
      operation_version: context.operation.version,
      project_id: context.project.id,
      payload: command.payload,
    });

    return this.transactions.reserve({
      correlation_id: this.correlationIds.next(),
      idempotency_key: idempotencyKey,
      request_fingerprint: requestFingerprint,
      owner_id: context.user.id,
      project_id: context.project.id,
      operation_id: context.operation.operation_id,
      operation_version: context.operation.version,
      provider: context.operation.provider,
      amount: context.operation.credit_cost,
    });
  }
}

/** Stable JSON plus SHA-256 makes retries comparable without storing payloads. */
export class Sha256RequestFingerprinter implements RequestFingerprinter {
  async fingerprint(value: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(canonicalJson(value));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
}

function requireIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || value.length < 16 || value.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new ReservationCommandError('invalid_idempotency_key', 'Idempotency key must be 16-128 safe characters');
  }
  return value;
}

function validateContext(context: TrustedReservationContext): void {
  if (!context || context.user.id.length === 0 || context.project.id.length === 0 ||
    context.project.created_by_id !== context.user.id) {
    throw new ReservationCommandError('invalid_authorization_context', 'Authorized owner and project are required');
  }
  const operation = context.operation;
  if (!operation.operation_id || !operation.provider || !Number.isInteger(operation.version) || operation.version < 1 ||
    !Number.isSafeInteger(operation.credit_cost) || operation.credit_cost < 0) {
    throw new ReservationCommandError('invalid_authorization_context', 'Authorized operation policy is invalid');
  }
}

function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  const visit = (current: unknown): unknown => {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new ReservationCommandError('invalid_request_payload', 'Payload contains a non-finite number');
      return current;
    }
    if (Array.isArray(current)) return current.map(visit);
    if (typeof current !== 'object') throw new ReservationCommandError('invalid_request_payload', 'Payload is not JSON-compatible');
    if (ancestors.has(current)) throw new ReservationCommandError('invalid_request_payload', 'Payload contains a cycle');
    ancestors.add(current);
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(current).sort()) output[key] = visit((current as Record<string, unknown>)[key]);
    ancestors.delete(current);
    return output;
  };
  return JSON.stringify(visit(value));
}

export class ReservationCommandError extends Error {
  readonly code: 'invalid_idempotency_key' | 'invalid_authorization_context' | 'invalid_request_payload';

  constructor(
    code: 'invalid_idempotency_key' | 'invalid_authorization_context' | 'invalid_request_payload',
    message: string,
  ) {
    super(message);
    this.name = 'ReservationCommandError';
    this.code = code;
  }
}
