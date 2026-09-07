import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  FinancialAccountSnapshot,
  FinancialTrialAuthority,
  FinancialTrialStartResult,
} from '../../transactions/application/financialAccountPorts.ts';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import {
  BROWSER_CSRF_HEADER,
  assertBrowserMutationAllowed,
  requestAuthorization,
} from './browserSessionCookie.ts';

export const FINANCIAL_TRIAL_START_PATH = '/api/core/financial/account/trial/start';

type FinancialAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type TrialAuthority = Pick<FinancialTrialAuthority, 'startTrial'>;
type TrialFailure = Exclude<FinancialTrialStartResult, { kind: 'started' | 'replayed' }>;

type AdapterInput = Readonly<{
  trials: TrialAuthority;
  auth: FinancialAuth;
  config: CoreServerConfig;
  accepting: () => boolean;
}>;

/**
 * Intent-only browser transport for server-owned one-time trial policy.
 * The browser may choose a target plan id; eligibility, duration, timestamps,
 * entitlement state and all wallet/grant behavior remain server-owned.
 */
export function createFinancialTrialHttpAdapter(input: AdapterInput) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    let url: URL;
    try { url = new URL(request.url ?? '/', 'http://core.invalid'); }
    catch { return false; }
    if (url.pathname !== FINANCIAL_TRIAL_START_PATH) return false;

    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    response.setHeader('Cache-Control', 'no-store');

    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') { send(response, 204, undefined); return true; }
      if (!input.accepting()) throw httpError(503, 'shutting_down', 'Server is shutting down');
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST, OPTIONS');
        throw httpError(405, 'method_not_allowed', 'Financial trial start requires POST');
      }
      if ([...url.searchParams.keys()].length !== 0) {
        throw httpError(400, 'forbidden_client_authority', 'Financial trial start accepts no query authority');
      }

      assertBrowserMutationAllowed(request, input.config);
      requireJson(request);
      const principal = await input.auth.verify(requestAuthorization(request, input.config));
      const planId = exactTrialBody(await readJson(request, input.config.bodyLimitBytes));

      const result = await input.trials.startTrial(Object.freeze({
        tenantId: principal.tenantId,
        userId: principal.userId,
      }), planId);

      if (result.kind !== 'started' && result.kind !== 'replayed') {
        const failure = trialFailure(result);
        throw httpError(failure.status, failure.code, failure.message);
      }

      send(response, result.kind === 'started' ? 201 : 200, publicResult(result));
      return true;
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'financial_trial_start_error'),
        message: status === 500 ? 'Financial trial start failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

function trialFailure(result: TrialFailure): Readonly<{ status: number; code: string; message: string }> {
  switch (result.kind) {
    case 'account_not_found':
      return Object.freeze({ status: 409, code: 'financial_account_unconfigured', message: 'Initialize the canonical FREE account before starting a trial' });
    case 'plan_not_eligible':
      return Object.freeze({ status: 400, code: 'trial_plan_not_eligible', message: 'The requested plan does not offer a server-policy trial' });
    case 'trial_conflict':
      return Object.freeze({ status: 409, code: 'trial_already_active', message: 'A different canonical trial is already active' });
    case 'trial_consumed':
      return Object.freeze({ status: 409, code: 'trial_already_consumed', message: 'The one-time trial has already been consumed' });
    case 'policy_conflict':
      return Object.freeze({ status: 409, code: 'financial_account_policy_conflict', message: 'Canonical entitlement is not eligible for server-policy trial transition' });
    case 'policy_drift':
      return Object.freeze({ status: 409, code: 'financial_account_policy_drift', message: 'Financial account policy state requires server-side resolution' });
  }
}

function publicResult(result: Extract<FinancialTrialStartResult, { kind: 'started' | 'replayed' }>) {
  return Object.freeze({
    replayed: result.kind === 'replayed',
    ...publicSnapshot(result.snapshot),
  });
}

function publicSnapshot(snapshot: FinancialAccountSnapshot) {
  const entitlement = snapshot.entitlement;
  const wallet = snapshot.wallet;
  if (!entitlement || !wallet) throw new Error('Financial trial transition returned an unconfigured snapshot');
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

function exactTrialBody(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, 'invalid_financial_trial_request', 'Financial trial body must be a JSON object containing only planId');
  }
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'planId') {
    throw httpError(400, 'forbidden_client_authority', 'Financial trial start accepts only planId from the client');
  }
  if (typeof body.planId !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(body.planId)) {
    throw httpError(400, 'invalid_trial_plan', 'planId must be a canonical plan identifier');
  }
  return body.planId;
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