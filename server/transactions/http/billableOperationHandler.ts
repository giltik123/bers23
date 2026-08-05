import {
  BillableOperationService,
  DefinitiveProviderFailure,
  ProviderOutcomePendingError,
  type BillableProvider,
} from '../application/billableOperationService.ts';
import {
  ReservationCommandError,
  type TrustedReservationContext,
} from '../application/reservationGateway.ts';
import { TransactionError } from '../application/transactionService.ts';

export interface HttpOperationAuthorizer {
  authorize(request: Request, operationId: unknown, projectId: unknown): Promise<TrustedReservationContext>;
}

export interface HttpProviderRouter {
  resolve(context: TrustedReservationContext, payload: unknown): BillableProvider<unknown>;
}

/** Framework-neutral authenticated HTTP endpoint for BillableOperationService. */
export function createBillableOperationHandler(
  operations: BillableOperationService,
  authorizer: HttpOperationAuthorizer,
  providers: HttpProviderRouter,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'POST') return errorResponse(405, 'method_not_allowed', 'POST is required');

    try {
      const body = await readJsonObject(request);
      const context = await authorizer.authorize(request, body.operation_id, body.project_id);
      const provider = providers.resolve(context, body.payload);
      const result = await operations.execute(context, {
        idempotency_key: request.headers.get('idempotency-key') ?? body.idempotency_key,
        payload: body.payload,
      }, provider);

      if (result.kind === 'provider_outcome_pending') {
        return Response.json(publicReservation('provider_outcome_pending', result.reservation), { status: 202 });
      }
      if (result.kind === 'replayed') {
        return Response.json(publicReservation(result.reservation.status, result.reservation));
      }
      return Response.json({ ...publicReservation('completed', result.reservation), result: result.value });
    } catch (error) {
      if (error instanceof ProviderOutcomePendingError) {
        return Response.json({ code: error.code, reservation_id: error.reservation_id,
          correlation_id: error.correlation_id }, { status: 202 });
      }
      if (error instanceof DefinitiveProviderFailure) {
        return errorResponse(502, error.code, 'Provider operation failed');
      }
      if (error instanceof ReservationCommandError) return errorResponse(400, error.code, error.message);
      if (error instanceof TransactionError) return errorResponse(error.status, error.code, error.message);
      if (error instanceof SyntaxError) return errorResponse(400, 'invalid_json', 'Request body must be valid JSON');
      return errorResponse(500, 'internal_error', 'Operation could not be completed');
    }
  };
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const value: unknown = await request.json();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReservationCommandError('invalid_request_payload', 'Request body must be an object');
  }
  return value as Record<string, unknown>;
}

function publicReservation(status: string, reservation: Readonly<{ id: string; correlation_id: string; status: string }>) {
  return { status, reservation_id: reservation.id, correlation_id: reservation.correlation_id,
    reservation_status: reservation.status };
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ code, error: message }, { status });
}
