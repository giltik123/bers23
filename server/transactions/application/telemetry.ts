export type TransactionTelemetryEvent = Readonly<{
  name: 'reservation_created' | 'reservation_replayed' | 'provider_dispatched' |
    'provider_succeeded' | 'provider_failed' | 'provider_outcome_pending' |
    'reservation_committed' | 'reservation_released' | 'recovery_batch' |
    'infrastructure_error';
  occurred_at: string;
  correlation_id?: string;
  reservation_id?: string;
  operation_id?: string;
  provider?: string;
  outcome?: string;
  count?: number;
  resolved?: number;
  deferred?: number;
  duration_ms?: number;
}>;

export interface TransactionTelemetry {
  record(event: TransactionTelemetryEvent): void;
}

export const NOOP_TRANSACTION_TELEMETRY: TransactionTelemetry = Object.freeze({ record() {} });

/** Structured JSON sink; events intentionally contain no payloads or credentials. */
export class ConsoleTransactionTelemetry implements TransactionTelemetry {
  record(event: TransactionTelemetryEvent): void {
    console.info(JSON.stringify({ scope: 'transaction_runtime', ...event }));
  }
}
