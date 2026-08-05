import { timingSafeEqual } from 'node:crypto';

import { RecoveryWorker } from '../application/recoveryWorker.ts';

/** Authenticated run-once endpoint suitable for a platform cron scheduler. */
export function createRecoveryHandler(
  worker: RecoveryWorker,
  bearerToken: string,
): (request: Request) => Promise<Response> {
  if (bearerToken.length < 32) throw new Error('Recovery bearer token must contain at least 32 characters');

  return async (request) => {
    if (request.method !== 'POST') return Response.json({ code: 'method_not_allowed' }, { status: 405 });
    if (!matchesBearerToken(request.headers.get('authorization'), bearerToken)) {
      return Response.json({ code: 'unauthorized' }, { status: 401 });
    }
    try {
      await worker.runOnce();
      return Response.json({ status: 'completed' });
    } catch {
      return Response.json({ code: 'recovery_unavailable' }, { status: 503 });
    }
  };
}

function matchesBearerToken(header: string | null, expected: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted);
}
