import { createHmac } from 'node:crypto';
import { HmacJwtVerifier, type AuthenticatedPrincipal } from './hmacJwtVerifier.ts';
import { credentialFromRow, PostgresAuthStore, type AuthUserRow } from './postgresAuthStore.ts';
import { verifyPassword } from './passwordCredential.ts';

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export class CanonicalAuthService {
  readonly #store: PostgresAuthStore;
  readonly #jwt: HmacJwtVerifier;
  readonly #jwtConfig: Readonly<{ secret: string; issuer: string; audience: string }>;
  readonly #now: () => number;
  readonly #sessionTtlMs: number;
  readonly #allowStatelessTestTokens: boolean;

  constructor(input: Readonly<{
    store: PostgresAuthStore;
    jwt: Readonly<{ secret: string; issuer: string; audience: string }>;
    now?: () => number;
    sessionTtlMs?: number;
    allowStatelessTestTokens?: boolean;
  }>) {
    this.#store = input.store;
    this.#jwtConfig = input.jwt;
    this.#now = input.now ?? Date.now;
    this.#sessionTtlMs = input.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.#allowStatelessTestTokens = input.allowStatelessTestTokens === true;
    this.#jwt = new HmacJwtVerifier(input.jwt, this.#now);
  }

  async login(email: string, password: string) {
    let row;
    try { row = await this.#store.findCredentialByEmail(email); }
    catch { row = undefined; }
    const valid = await verifyPassword(password, row ? credentialFromRow(row) : undefined);
    if (!row || !valid) throw invalidCredentials();
    const now = this.#now();
    const expiresAt = now + this.#sessionTtlMs;
    const session = await this.#store.createSession(row, now, expiresAt);
    const accessToken = signJwt({
      sub: row.user_id, tenantId: row.tenant_id, sid: session.sessionId,
      iss: this.#jwtConfig.issuer, aud: this.#jwtConfig.audience,
      iat: Math.floor(now / 1000), exp: Math.floor(expiresAt / 1000),
    }, this.#jwtConfig.secret);
    return Object.freeze({ access_token: accessToken, token_type: 'Bearer', expires_at: session.expiresAt.toISOString(), user: publicUser(row) });
  }

  async verify(authorization: string | undefined): Promise<AuthenticatedPrincipal> {
    const principal = this.#jwt.verify(authorization);
    if (!principal.sessionId) {
      if (this.#allowStatelessTestTokens) return principal;
      throw unauthenticated();
    }
    const user = await this.#store.activeSession(principal.sessionId, principal.userId, principal.tenantId, this.#now());
    if (!user) throw unauthenticated();
    return principal;
  }

  async context(authorization: string | undefined) {
    const principal = await this.verify(authorization);
    const user = await this.#store.getUser(principal.userId, principal.tenantId);
    if (!user) throw unauthenticated();
    return publicUser(user);
  }

  async logout(authorization: string | undefined) {
    const principal = this.#jwt.verify(authorization);
    if (!principal.sessionId) {
      if (this.#allowStatelessTestTokens) return;
      throw unauthenticated();
    }
    await this.#store.revokeSession(principal.sessionId, principal.userId, principal.tenantId, this.#now());
  }

  get store() { return this.#store; }
}

function publicUser(row: AuthUserRow) {
  return Object.freeze({
    id: row.user_id,
    user_id: row.user_id,
    tenant_id: row.tenant_id,
    email: row.email,
    full_name: row.display_name,
    status: row.status,
  });
}

function signJwt(claims: Record<string, unknown>, secret: string) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode(claims);
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function invalidCredentials() {
  return Object.assign(new Error('Invalid email or password'), { status: 401, code: 'invalid_credentials', retryable: false });
}

function unauthenticated() {
  return Object.assign(new Error('Authentication token is invalid'), { status: 401, code: 'unauthenticated', retryable: false });
}
