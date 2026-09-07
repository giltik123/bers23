import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  FinancialAccountBootstrapAuthority,
  FinancialAccountBootstrapResult,
  FinancialAccountSnapshot,
} from '../../transactions/application/financialAccountPorts.ts';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import {
  BROWSER_CSRF_HEADER,
  assertBrowserMutationAllowed,
  requestAuthorization,
} from './browserSessionCookie.ts';

export const FINANCIAL_ACCOUNT_INITIALIZE_PATH = '/api/core/financial/account/initialize';

type FinancialAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type FinancialAccountBootstrap = Pick<FinancialAccountBootstrapAuthority, 'initializeFreeAccount'>;

type AdapterInput = Readonly<{
  account: FinancialAccountBootstrap;
  auth: FinancialAuth;
  config: CoreServerConfig;
  accepting: () => boolean;
}>;

/**
 * Intent-only browser transport for the server-owned FREE account policy.
 * The browser can request initialization for its authenticated principal only;
 * plan, entitlement state, amount, time and idempotency material remain Core-owned.
 */
export function createFinancialAccountPolicyHttpAdapter(input: AdapterInput) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    let url: URL;
    try { url = new URL(request.url ?? '/', 'http://core.invalid'); }
    catch { return false; }
    if (url.pathname !== FINANCIAL_ACCOUNT_INITIALIZE_PATH) return false;

    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    response.setHeader('Cache-Control', 'no-store');

    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') { send(response, 204, undefined); return true; }
      if (!input.accepting()) throw httpError(503, 'shutting_down', 'Server is shutting down');
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST, OPTIONS');
        throw httpError(405, 'method_not_allowed', 'Financial account initialization requires POST');
      }
      if ([...url.searchParams.keys()].length !== 0) {
        throw httpError(400, 'forbidden_client_authority', 'Financial account initialization accepts no query authority');
      }

      assertBrowserMutationAllowed(request, input.config);
      requireJson(request);
      const principal = await input.auth.verify(requestAuthorization(request, input.config));
      exactEmptyBody(await readJson(request, input.config.bodyLimitBytes));

      const result = await input.account.initializeFreeAccount(Object.freeze({
        tenantId: principal.tenantId,
        userId: principal.userId,
      }));
      if (result.kind === 'policy_conflict') {
        throw httpError(409, 'financial_account_policy_conflict', 'Financial account already has a different canonical entitlement');
      }
      if (result.kind === 'policy_drift') {
        throw httpError(409, 'financial_account_policy_drift', 'Financial account policy state requires server-side resolution');
      }

      send(response, result.kind === 'initialized' ? 201 : 200, publicResult(result));
      return true;
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'financial_account_initialize_error'),
        message: status === 500 ? 'Financial account initialization failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

function publicResult(result: Extract<FinancialAccountBootstrapResult, { kind: 'initialized' | 'replayed' }>) {
  return Object.freeze({
    replayed: result.kind === 'replayed',
    ...publicSnapshot(result.snapshot),
  });
}

function publicSnapshot(snapshot: FinancialAccountSnapshot) {
  const entitlement = snapshot.entitlement;
  const wallet = snapshot.wallet;
  if (!entitlement || !wallet) throw new Error('Financial account bootstrap returned an unconfigured snapshot');
  return Object.freeze({
    accountState: 'CONFIGURED' as const,
    entitlement: Object.freeze({
      planId: entitlement.planId,
      state: entitlement.state,
      ...(entitlement.billingInterval ? { billingInterval: entitlement.billingInterval } : {}),
      source: entitlement.source,
      revision: entitlement.revision,
      startsAt: entitlement.startsAt,
      ...(entitlement.endsAt ? { endsAt: entitlement.endsAt } : {}),
      ...(entitlement.trialConsumedAt ? { trialConsumedAt: entitlement.trialConsumedAt } : {}),
      updatedAt: entitlement.updatedAt,
    }),
    wallet: Object.freeze({
      totalCredited: wallet.totalCredited,
      lifetimeSpent: wallet.lifetimeSpent,
      balance: wallet.balance,
      reserved: wallet.reserved,
      available: wallet.available,
      version: wallet.version,
      updatedAt: wallet.updatedAt,
    }),
  });
}

function exactEmptyBody(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, 'invalid_financial_initialize_request', 'Financial account initialization body must be an empty JSON object');
  }
  if (Object.keys(value as Record<string, unknown>).length !== 0) {
    throw httpError(400, 'forbidden_client_authority', 'Financial account initialization accepts no client financial fields');
  }
}

function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin');
  if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', `Content-Type, X-Correlation-Id, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Expose-Headers', `X-Correlation-Id, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function requireJson(request: IncomingMessage): void {
  if (mediaType(request) !== 'application/json') throw httpError(415, 'unsupported_media_type', 'Content-Type must be application/json');
}

function mediaType(request: IncomingMessage): string {
  return String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
}

async function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
  const bytes = await readBytes(request, limit);
  try { return JSON.parse(Buffer.from(bytes).toString('utf8')); }
  catch { throw httpError(400, 'invalid_json', 'Invalid JSON body'); }
}

async function readBytes(request: IncomingMessage, limit: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.byteLength;
    if (size > limit) throw httpError(413, 'body_too_large', 'Request body exceeds the configured limit');
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (body === undefined) { response.end(); return; }
  const bytes = Buffer.from(JSON.stringify(body));
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Content-Length', bytes.byteLength);
  response.end(bytes);
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
