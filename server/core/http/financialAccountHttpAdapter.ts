import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FinancialAccountReader, FinancialAccountSnapshot } from '../../transactions/application/financialAccountPorts.ts';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import { BROWSER_CSRF_HEADER, requestAuthorization } from './browserSessionCookie.ts';

export const FINANCIAL_ACCOUNT_PATH = '/api/core/financial/account';

type FinancialAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type FinancialAccountObservation = Pick<FinancialAccountReader, 'snapshot'>;

/** Authenticated observation-only projection. It has no grant/entitlement mutation port. */
export function createFinancialAccountHttpAdapter(input: Readonly<{
  account: FinancialAccountObservation;
  auth: FinancialAuth;
  config: CoreServerConfig;
}>) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://core.invalid');
    if (url.pathname !== FINANCIAL_ACCOUNT_PATH) return false;

    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    response.setHeader('Cache-Control', 'no-store');

    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') { send(response, 204, undefined); return true; }
      if (request.method !== 'GET') throw httpError(405, 'method_not_allowed', 'Financial account projection is read-only');
      if ([...url.searchParams.keys()].length !== 0) throw httpError(400, 'unexpected_query_parameter', 'Financial account projection accepts no query authority');

      const principal = await input.auth.verify(requestAuthorization(request, input.config));
      const snapshot = await input.account.snapshot(Object.freeze({ tenantId: principal.tenantId, userId: principal.userId }));
      send(response, 200, publicSnapshot(snapshot));
      return true;
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'financial_account_error'),
        message: status === 500 ? 'Financial account request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

function publicSnapshot(snapshot: FinancialAccountSnapshot) {
  const entitlement = snapshot.entitlement;
  const wallet = snapshot.wallet;
  return Object.freeze({
    accountState: entitlement ? 'CONFIGURED' as const : 'UNCONFIGURED' as const,
    entitlement: entitlement ? Object.freeze({
      planId: entitlement.planId,
      state: entitlement.state,
      ...(entitlement.billingInterval ? { billingInterval: entitlement.billingInterval } : {}),
      source: entitlement.source,
      revision: entitlement.revision,
      startsAt: entitlement.startsAt,
      ...(entitlement.endsAt ? { endsAt: entitlement.endsAt } : {}),
      ...(entitlement.trialConsumedAt ? { trialConsumedAt: entitlement.trialConsumedAt } : {}),
      updatedAt: entitlement.updatedAt,
    }) : null,
    wallet: wallet ? Object.freeze({
      totalCredited: wallet.totalCredited,
      lifetimeSpent: wallet.lifetimeSpent,
      balance: wallet.balance,
      reserved: wallet.reserved,
      available: wallet.available,
      version: wallet.version,
      updatedAt: wallet.updatedAt,
    }) : null,
  });
}

function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin');
  if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', `X-Correlation-Id, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Expose-Headers', `X-Correlation-Id, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  if (body === undefined) { response.end(); return; }
  const bytes = Buffer.from(JSON.stringify(body));
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Content-Length', bytes.byteLength);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(bytes);
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
