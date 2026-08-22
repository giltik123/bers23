import { createHmac } from 'node:crypto';
import { HmacJwtVerifier, type AuthenticatedPrincipal } from './hmacJwtVerifier.ts';
import { credentialFromRow, PostgresAuthStore, type AuthCredentialRow, type AuthUserRow } from './postgresAuthStore.ts';
import { verifyPassword } from './passwordCredential.ts';
import { digestMatches, keyedDigest, opaqueToken, sixDigitCode } from './authSecrets.ts';
import type { AuthEmailSender } from './resendEmailSender.ts';
import type { GoogleOidcClient } from './googleOidcClient.ts';

const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const VERIFICATION_TTL_MS = 10 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const BROWSER_GRANT_TTL_MS = 2 * 60 * 1000;

export class CanonicalAuthService {
  readonly #store: PostgresAuthStore;
  readonly #jwt: HmacJwtVerifier;
  readonly #jwtConfig: Readonly<{ secret: string; issuer: string; audience: string }>;
  readonly #now: () => number;
  readonly #sessionTtlMs: number;
  readonly #allowStatelessTestTokens: boolean;
  readonly #challengeSecret: string;
  readonly #defaultTenantId: string;
  readonly #publicOrigin: string;
  readonly #email: AuthEmailSender;
  readonly #google: GoogleOidcClient;

  constructor(input: Readonly<{
    store: PostgresAuthStore;
    jwt: Readonly<{ secret: string; issuer: string; audience: string }>;
    challengeSecret: string;
    defaultTenantId: string;
    publicOrigin: string;
    email: AuthEmailSender;
    google: GoogleOidcClient;
    now?: () => number;
    sessionTtlMs?: number;
    allowStatelessTestTokens?: boolean;
  }>) {
    this.#store = input.store;
    this.#jwtConfig = input.jwt;
    this.#challengeSecret = input.challengeSecret;
    this.#defaultTenantId = input.defaultTenantId;
    this.#publicOrigin = normalizeOrigin(input.publicOrigin);
    this.#email = input.email;
    this.#google = input.google;
    this.#now = input.now ?? Date.now;
    this.#sessionTtlMs = input.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.#allowStatelessTestTokens = input.allowStatelessTestTokens === true;
    this.#jwt = new HmacJwtVerifier(input.jwt, this.#now);
  }

  async register(email: string, password: string, displayName?: string) {
    const code = sixDigitCode(), now = this.#now();
    const result = await this.#store.beginRegistration({
      tenantId: this.#defaultTenantId,
      email,
      password,
      displayName,
      challengeDigest: keyedDigest(this.#challengeSecret, 'email-verification', code),
      nowMs: now,
      expiresAtMs: now + VERIFICATION_TTL_MS,
    });
    const recipient = email.trim();
    const recipientKey = keyedDigest(this.#challengeSecret, 'email-recipient', recipient.toLowerCase()).toString('hex').slice(0, 32);
    await this.#email.sendVerification({ to: recipient, code, idempotencyKey: `verify/${recipientKey}/${result.sendCount}` });
    return Object.freeze({ status: 'verification_required' });
  }

  async resendOtp(email: string) {
    const code = sixDigitCode(), now = this.#now();
    let result;
    try {
      result = await this.#store.resendVerification(email, keyedDigest(this.#challengeSecret, 'email-verification', code), now, now + VERIFICATION_TTL_MS);
    } catch (error) {
      if ((error as { code?: string }).code === 'invalid_email' || (error as { code?: string }).code === 'verification_rate_limited') return Object.freeze({ status: 'accepted' });
      throw error;
    }
    if (result) await this.#email.sendVerification({ to: result.user.email, code, idempotencyKey: `verify/${result.user.user_id}/${result.sendCount}` });
    return Object.freeze({ status: 'accepted' });
  }

  async verifyOtp(email: string, otpCode: string) {
    if (!/^\d{6}$/.test(otpCode ?? '')) throw invalidVerification();
    const user = await this.#store.verifyEmail(email, keyedDigest(this.#challengeSecret, 'email-verification', otpCode), this.#now());
    return this.issueSession(user);
  }

  async resetPasswordRequest(email: string) {
    const token = opaqueToken(32), now = this.#now();
    let reset;
    try { reset = await this.#store.createPasswordReset(email, keyedDigest(this.#challengeSecret, 'password-reset', token), now, now + RESET_TTL_MS); }
    catch (error) { if ((error as { code?: string }).code !== 'invalid_email') throw error; }
    if (reset) {
      const url = new URL('/reset-password', this.#publicOrigin);
      url.searchParams.set('token', token);
      try { await this.#email.sendPasswordReset({ to: reset.user.email, resetUrl: url.toString(), idempotencyKey: `reset/${reset.resetId}` }); }
      catch { /* Public reset-request remains enumeration-resistant even during delivery failure. */ }
    }
    return Object.freeze({ status: 'accepted' });
  }

  async resetPassword(resetToken: string, newPassword: string) {
    if (typeof resetToken !== 'string' || resetToken.length < 20 || resetToken.length > 256) throw invalidReset();
    const user = await this.#store.consumePasswordReset(keyedDigest(this.#challengeSecret, 'password-reset', resetToken), newPassword, this.#now());
    if (!user) throw invalidReset();
    return Object.freeze({ status: 'password_reset' });
  }

  async googleStart(returnTo?: string) {
    const state = opaqueToken(32), nonce = opaqueToken(32), now = this.#now();
    const safeReturnTo = sanitizeReturnTo(returnTo);
    await this.#store.createOAuthState(
      keyedDigest(this.#challengeSecret, 'google-state', state),
      keyedDigest(this.#challengeSecret, 'google-nonce', nonce),
      safeReturnTo,
      now,
      now + OAUTH_STATE_TTL_MS,
    );
    return this.#google.authorizationUrl({ state, nonce });
  }

  async googleCallback(state: string, code: string) {
    if (typeof state !== 'string' || state.length < 20 || state.length > 256) throw oauthDenied();
    const oauthState = await this.#store.consumeOAuthState(keyedDigest(this.#challengeSecret, 'google-state', state), this.#now());
    if (!oauthState) throw oauthDenied();
    const claims = await this.#google.exchangeAndVerify(code);
    const nonceDigest = keyedDigest(this.#challengeSecret, 'google-nonce', claims.nonce);
    if (!digestMatches(nonceDigest, oauthState.nonceDigest)) throw oauthDenied();
    const domain = claims.email.split('@').pop()?.toLowerCase();
    const authoritativeEmail = claims.email_verified && (domain === 'gmail.com' || Boolean(claims.hd));
    const user = await this.#store.resolveGoogleIdentity({ subject: claims.sub, email: claims.email, displayName: claims.name, authoritativeEmail, defaultTenantId: this.#defaultTenantId, nowMs: this.#now() });
    const grant = opaqueToken(32), now = this.#now();
    await this.#store.createBrowserGrant(keyedDigest(this.#challengeSecret, 'browser-grant', grant), user, now, now + BROWSER_GRANT_TTL_MS);
    const redirect = new URL(oauthState.returnTo, this.#publicOrigin);
    redirect.searchParams.set('auth_code', grant);
    return redirect.toString();
  }

  async exchangeBrowserGrant(code: string) {
    if (typeof code !== 'string' || code.length < 20 || code.length > 256) throw oauthDenied();
    const user = await this.#store.consumeBrowserGrant(keyedDigest(this.#challengeSecret, 'browser-grant', code), this.#now());
    if (!user) throw oauthDenied();
    return this.issueSession(user);
  }

  async login(email: string, password: string) {
    let row: AuthCredentialRow | undefined;
    try { row = await this.#store.findCredentialByEmail(email); }
    catch (error) { if ((error as { code?: string }).code === 'invalid_email') row = undefined; else throw error; }
    const valid = await verifyPassword(password, row ? credentialFromRow(row) : undefined);
    if (!row || !valid) throw invalidCredentials();
    return this.issueSession(row);
  }

  async verify(authorization: string | undefined): Promise<AuthenticatedPrincipal> {
    const principal = this.#jwt.verify(authorization);
    if (!principal.sessionId) { if (this.#allowStatelessTestTokens) return principal; throw unauthenticated(); }
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
    if (!principal.sessionId) { if (this.#allowStatelessTestTokens) return; throw unauthenticated(); }
    await this.#store.revokeSession(principal.sessionId, principal.userId, principal.tenantId, this.#now());
  }

  get store() { return this.#store; }

  private async issueSession(user: AuthUserRow) {
    if (user.status !== 'active') throw unauthenticated();
    const now = this.#now(), expiresAt = now + this.#sessionTtlMs;
    const session = await this.#store.createSession(user, now, expiresAt);
    const accessToken = signJwt({ sub: user.user_id, tenantId: user.tenant_id, sid: session.sessionId, iss: this.#jwtConfig.issuer, aud: this.#jwtConfig.audience, iat: Math.floor(now / 1000), exp: Math.floor(expiresAt / 1000) }, this.#jwtConfig.secret);
    return Object.freeze({ access_token: accessToken, token_type: 'Bearer', expires_at: session.expiresAt.toISOString(), user: publicUser(user) });
  }
}

function publicUser(row: AuthUserRow) { return Object.freeze({ id: row.user_id, user_id: row.user_id, tenant_id: row.tenant_id, email: row.email, full_name: row.display_name, status: row.status, email_verified: Boolean(row.email_verified_at) }); }
function signJwt(claims: Record<string, unknown>, secret: string) { const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url'); const header=encode({alg:'HS256',typ:'JWT'}),payload=encode(claims); const signature=createHmac('sha256',secret).update(`${header}.${payload}`).digest('base64url'); return `${header}.${payload}.${signature}`; }
function normalizeOrigin(value: string) { const url = new URL(value); if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error('AUTH_PUBLIC_ORIGIN must use HTTPS outside localhost'); url.pathname='/'; url.search=''; url.hash=''; return url.toString(); }
function sanitizeReturnTo(value?: string) { const target=value?.trim()||'/'; if(!target.startsWith('/')||target.startsWith('//')||target.length>2048)return '/'; return target; }
function invalidCredentials() { return Object.assign(new Error('Invalid email or password'), { status: 401, code: 'invalid_credentials', retryable: false }); }
function invalidVerification() { return Object.assign(new Error('Verification code is invalid or expired'), { status: 400, code: 'invalid_verification', retryable: false }); }
function invalidReset() { return Object.assign(new Error('Password reset token is invalid or expired'), { status: 400, code: 'invalid_reset_token', retryable: false }); }
function oauthDenied() { return Object.assign(new Error('Google authentication failed'), { status: 401, code: 'oauth_failed', retryable: false }); }
function unauthenticated() { return Object.assign(new Error('Authentication token is invalid'), { status: 401, code: 'unauthenticated', retryable: false }); }
