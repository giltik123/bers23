import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CoreServerConfig } from '../config.ts';

const PRODUCTION_COOKIE_NAME = '__Host-bers_session';
const LOCAL_COOKIE_NAME = 'bers_session_dev';
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Converts the canonical server-issued session envelope into an HttpOnly browser
 * cookie and deliberately removes bearer material from the public JSON body.
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
  if (typeof token !== 'string' || token.length > 4096 || !JWT_PATTERN.test(token) || typeof expiresAtValue !== 'string') {
    throw sessionEnvelopeError();
  }
  const expiresAtMs = Date.parse(expiresAtValue);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) throw sessionEnvelopeError();

  response.setHeader('Set-Cookie', serializeSessionCookie(token, expiresAtMs, config, nowMs));
  const { access_token: _accessToken, token_type: _tokenType, ...publicBody } = envelope;
  return Object.freeze(publicBody);
}

/**
 * Browser requests authenticate only with the HttpOnly cookie. A browser cannot
 * silently fall back to a stale/localStorage Authorization bearer. Non-browser
 * API clients retain the existing explicit Authorization compatibility path.
 */
export function requestAuthorization(request: IncomingMessage, config: CoreServerConfig): string | undefined {
  const cookieToken = readSessionCookie(request, config);
  if (isBrowserRequest(request)) return cookieToken ? `Bearer ${cookieToken}` : undefined;
  const authorization = header(request, 'authorization');
  return authorization || (cookieToken ? `Bearer ${cookieToken}` : undefined);
}

export function clearBrowserSession(response: ServerResponse, config: CoreServerConfig): void {
  const secure = secureCookies(config);
  response.setHeader(
    'Set-Cookie',
    `${cookieName(config)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? '; Secure' : ''}`,
  );
}

export function cookieName(config: CoreServerConfig): string {
  return secureCookies(config) ? PRODUCTION_COOKIE_NAME : LOCAL_COOKIE_NAME;
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

function isBrowserRequest(request: IncomingMessage): boolean {
  return Boolean(
    header(request, 'origin')
    || header(request, 'sec-fetch-site')
    || header(request, 'sec-fetch-mode')
    || header(request, 'sec-fetch-dest'),
  );
}

function secureCookies(config: CoreServerConfig): boolean {
  try { return new URL(config.authPublicOrigin).protocol === 'https:'; }
  catch { return true; }
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function sessionEnvelopeError() {
  return Object.assign(new Error('Canonical session issuance failed'), { status: 500, code: 'session_issuance_failed', retryable: false });
}
