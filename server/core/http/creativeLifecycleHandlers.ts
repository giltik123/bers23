import { randomUUID } from 'node:crypto';
import type { CreativeExecutionService } from '../application/creativeExecutionService.ts';
import type { CoreRequest, CoreResponse } from './creativeExecuteHandler.ts';

export function createCreativeLifecycleHandlers(service: CreativeExecutionService) {
  const authenticated = (request: CoreRequest): CoreResponse | undefined => request.auth ? undefined : { status: 401, body: { code: 'unauthenticated', message: 'Authentication is required', correlationId: randomUUID(), retryable: false } };
  return Object.freeze({
    status: (request: CoreRequest, executionId: string): CoreResponse => authenticated(request) ?? { status: 200, body: { executionId, status: service.status(executionId) } },
    result: (request: CoreRequest, executionId: string): CoreResponse => { const denied = authenticated(request); if (denied) return denied; const result = service.result(executionId); return result ? { status: 200, body: result } : { status: 404, body: { code: 'result_not_found', message: 'Result is not available', retryable: true } }; },
    cancel: (request: CoreRequest, executionId: string): CoreResponse => { const denied = authenticated(request); if (denied) return denied; service.cancel(executionId); return { status: 202, body: { executionId, status: service.status(executionId) } }; },
  });
}
