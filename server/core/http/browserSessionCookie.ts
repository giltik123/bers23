import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CoreServerConfig } from '../config.ts';

const PRODUCTION_COOKIE_NAME = '__Host-bers_session';
const LOCAL_COOKIE_NAME = 'bers_session_dev';
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const CSRF_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const BROWSER_CSRF_HEADER = 'X-Bers-CSRF-Token';

/**
 * Converts the canonical server-issued session envelope into an HttpOnly browser
 * cookie. The public body is an allowlist so future token-like fields cannot
 * accidentally become browser-visible through object spreading.
 *
 * The anti-forgery token is derived from the HttpOnly session credential with a
 * server secret. It is intentionally not a credential: browser JavaScript may
 * keep it in memory and echo it in an unsafe request header, while the session
 * JWT itself remains inaccessible to JavaScript.
 */
export function establishBrowserSession(
  response: ServerResponse,
  result: unknown,
  config: CoreServerConfig,
  nowMs = Date.now(),
): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw sessionEnvelopeError();
  const envelope = result as Record<string, unknown>;
  const token = envelope.access_token;
  const expiresAtValue = envelope.expires_at;
  const user = envelope.user;
  if (
    typeof token !== 'string'
    || token.length > 4096
    || !JWT_PATTERN.test(token)
    || typeof expiresAtValue !== 'string'
    || !user
    || typeof user !== 'object'
    || Array.isArray(user)
  ) throw sessionEnvelopeError();

  const expiresAtMs = Date.parse(expiresAtValue);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) throw sessionEnvelopeError();

  response.setHeader('Set-Cookie', serializeSessionCookie(token, expiresAtMs, config, nowMs));
  response.setHeader(BROWSER_CSRF_HEADER, csrfToken(token, config));
  return Object.freeze({ expires_at: expiresAtValue, user });
}

/**
 * Cookie authority wins whenever present. In production, Authorization bearer
 * is disabled unless the operator explicitly opts in for a separate API-client
 * compatibility deployment. Requests carrying Sec-Fetch-Site are always treated
 * as browser traffic and can never use bearer fallback.
 */
export function requestAuthorization(request: IncomingMessage, config: CoreServerConfig): string | undefined {
  const cookieToken = readSessionCookie(request, config);
  if (cookieToken) return `Bearer ${cookieToken}`;
  if (header(request, 'sec-fetch-site')) return undefined;
  const bearerEnabled = config.nodeEnv !== 'production' || config.allowApiBearerAuth === true;
  return bearerEnabled ? header(request, 'authorization') : undefined;
}

/**
 * Re-publishes the non-secret session-bound CSRF proof after an authenticated
 * context check. This lets a reloaded SPA restore anti-forgery state without
 * ever reading the HttpOnly session cookie.
 */
export function exposeBrowserCsrfToken(response: ServerResponse, request: IncomingMessage, config: CoreServerConfig): void {
  const token = readSessionCookie(request, config);
  if (token) response.setHeader(BROWSER_CSRF_HEADER, csrfToken(token, config));
}

/**
 * Unsafe requests authenticated by the browser session cookie require both an
 * exact configured Origin and the session-bound CSRF header. Bearer-only API
 * clients are outside this browser-cookie authority and therefore are not
 * forced through a browser anti-forgery protocol.
 */
export function assertBrowserMutationAllowed(request: IncomingMessage, config: CoreServerConfig): void {
  if (!unsafeMethod(request.method)) return;
  const token = readSessionCookie(request, config);
  if (!token) return;

  const origin = header(request, 'origin');
  if (!origin || !config.allowedWebOrigins.includes(origin)) throw browserMutationDenied('origin_denied');

  const supplied = header(request, BROWSER_CSRF_HEADER.toLowerCase());
  const expected = csrfToken(token, config);
  if (!safeTokenEqual(supplied, expected)) throw browserMutationDenied('csrf_denied');
}

/**
 * Browser auth mutations that do not have a session yet (login/register/reset)
 * cannot present a session-bound CSRF proof. They still require an exact Origin
 * so cross-site forms cannot create, replace or mutate a browser identity.
 */
export function assertBrowserAuthMutationOrigin(request: IncomingMessage, config: CoreServerConfig): void {
  if (!unsafeMethod(request.method)) return;
  const origin = header(request, 'origin');
  if (!origin || !config.allowedWebOrigins.includes(origin)) throw browserMutationDenied('origin_denied');
}

export function clearBrowserSession(response: ServerResponse, config: CoreServerConfig): void {
  const secure = secureCookies(config);
  response.setHeader(
    'Set-Cookie',
    `${cookieName(config)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`,
  );
  response.setHeader(BROWSER_CSRF_HEADER, '');
}

export function cookieName(config: CoreServerConfig): string {
  return secureCookies(config) ? PRODUCTION_COOKIE_NAME : LOCAL_COOKIE_NAME;
}

function csrfToken(sessionToken: string, config: CoreServerConfig): string {
  return createHmac('sha256', config.authChallengeSecret)
    .update('bers-browser-csrf-v1\0')
    .update(sessionToken)
    .digest('base64url');
}

function safeTokenEqual(supplied: string | undefined, expected: string): boolean {
  if (!supplied || !CSRF_PATTERN.test(supplied) || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function serializeSessionCookie(token: string, expiresAtMs: number, config: CoreServerConfig, nowMs: number): string {
  const secure = secureCookies(config);
  const maxAgeSeconds = Math.max(1, Math.ceil((expiresAtMs - nowMs) / 1000));
  return `${cookieName(config)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}; Expires=${new Date(expiresAtMs).toUTCString()}${secure ? '; Secure' : ''}`;
}

function readSessionCookie(request: IncomingMessage, config: CoreServerConfig): string | undefined {
  const raw = header(request, 'cookie');
  if (!raw) return undefined;
  const target = cookieName(config);
  const matches: string[] = [];
  for (const part of raw.split(';')) {
    const entry = part.trim();
    const separator = entry.indexOf('=');
    if (separator < 1) continue;
    const name = entry.slice(0, separator).trim();
    if (name !== target) continue;
    matches.push(entry.slice(separator + 1).trim());
  }
  // Duplicate session cookies are ambiguous and therefore fail closed.
  if (matches.length !== 1) return undefined;
  const token = matches[0];
  return token.length <= 4096 && JWT_PATTERN.test(token) ? token : undefined;
}

function unsafeMethod(method: string | undefined): boolean {
  const normalized = (method ?? 'GET').toUpperCase();
  return normalized !== 'GET' && normalized !== 'HEAD' && normalized !== 'OPTIONS';
}

function secureCookies(config: CoreServerConfig): boolean {
  try { return new URL(config.authPublicOrigin).protocol === 'https:'; }
  catch { return true; }
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function browserMutationDenied(code: 'origin_denied' | 'csrf_denied') {
  const message = code === 'origin_denied' ? 'Origin is required for browser mutations' : 'Browser anti-forgery proof is invalid';
  return Object.assign(new Error(message), { status: 403, code, retryable: false });
}

function sessionEnvelopeError() {
  return Object.assign(new Error('Canonical session issuance failed'), { status: 500, code: 'session_issuance_failed', retryable: false });
}
