import { createHmac } from 'node:crypto';
import { HmacJwtVerifier, type AuthenticatedPrincipal } from './hmacJwtVerifier.ts';
import { credentialFromRow, PostgresAuthStore, type AuthCredentialRow, type AuthUserRow } from './postgresAuthStore.ts';
import { PostgresAuthSecurityStore, type RateLimitPolicy } from './postgresAuthSecurityStore.ts';
import { verifyPassword } from './passwordCredential.ts';
import { digestMatches, keyedDigest, opaqueToken, sixDigitCode } from './authSecrets.ts';
import type { AuthEmailSender } from './resendEmailSender.ts';
import type { GoogleOidcClient } from './googleOidcClient.ts';

const DEFAULT_SESSION_ABSOLUTE_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
const VERIFICATION_TTL_MS = 10 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const LIMIT = Object.freeze({
  loginAccount: policy(15 * 60_000, 10, 15 * 60_000),
  loginPeer: policy(15 * 60_000, 50, 15 * 60_000),
  registrationAccount: policy(60 * 60_000, 5, 30 * 60_000),
  registrationPeer: policy(60 * 60_000, 20, 30 * 60_000),
  verificationAccount: policy(10 * 60_000, 5, 10 * 60_000),
  verificationPeer: policy(10 * 60_000, 30, 10 * 60_000),
  resendAccount: policy(60 * 60_000, 10, 30 * 60_000),
  resendPeer: policy(60 * 60_000, 30, 30 * 60_000),
  resetAccount: policy(60 * 60_000, 5, 30 * 60_000),
  resetPeer: policy(60 * 60_000, 30, 30 * 60_000),
  resetToken: policy(30 * 60_000, 10, 30 * 60_000),
  oauthStartPeer: policy(10 * 60_000, 30, 10 * 60_000),
  oauthState: policy(10 * 60_000, 10, 10 * 60_000),
  oauthCallbackPeer: policy(10 * 60_000, 60, 10 * 60_000),
});

export type AuthRiskContext = Readonly<{ peerAddress?: string }>;

export class CanonicalAuthService {
  readonly #store: PostgresAuthStore;
  readonly #security: PostgresAuthSecurityStore;
  readonly #jwt: HmacJwtVerifier;
  readonly #jwtConfig: Readonly<{ secret: string; issuer: string; audience: string }>;
  readonly #now: () => number;
  readonly #sessionAbsoluteTtlMs: number;
  readonly #sessionIdleTtlMs: number;
  readonly #allowStatelessTestTokens: boolean;
  readonly #challengeSecret: string;
  readonly #defaultTenantId: string;
  readonly #publicOrigin: string;
  readonly #email: AuthEmailSender;
  readonly #google: GoogleOidcClient;

  constructor(input: Readonly<{
    store: PostgresAuthStore;
    securityStore: PostgresAuthSecurityStore;
    jwt: Readonly<{ secret: string; issuer: string; audience: string }>;
    challengeSecret: string;
    defaultTenantId: string;
    publicOrigin: string;
    email: AuthEmailSender;
    google: GoogleOidcClient;
    now?: () => number;
    sessionTtlMs?: number;
    sessionIdleTtlMs?: number;
    allowStatelessTestTokens?: boolean;
  }>) {
    this.#store = input.store;
    this.#security = input.securityStore;
    this.#jwtConfig = input.jwt;
    this.#challengeSecret = input.challengeSecret;
    this.#defaultTenantId = input.defaultTenantId;
    this.#publicOrigin = normalizeOrigin(input.publicOrigin);
    this.#email = input.email;
    this.#google = input.google;
    this.#now = input.now ?? Date.now;
    this.#sessionAbsoluteTtlMs = input.sessionTtlMs ?? DEFAULT_SESSION_ABSOLUTE_TTL_MS;
    this.#sessionIdleTtlMs = input.sessionIdleTtlMs ?? DEFAULT_SESSION_IDLE_TTL_MS;
    if (!Number.isFinite(this.#sessionAbsoluteTtlMs) || !Number.isFinite(this.#sessionIdleTtlMs)
      || this.#sessionAbsoluteTtlMs < 1 || this.#sessionIdleTtlMs < 1 || this.#sessionIdleTtlMs > this.#sessionAbsoluteTtlMs) {
      throw new Error('Invalid canonical auth session lifetime');
    }
    this.#allowStatelessTestTokens = input.allowStatelessTestTokens === true;
    this.#jwt = new HmacJwtVerifier(input.jwt, this.#now);
  }

  async register(email: string, password: string, displayName?: string, risk?: AuthRiskContext) {
    const verificationHandle = opaqueToken(32);
    const abuse = await this.#accountAndPeerBudget('registration', email, risk, LIMIT.registrationAccount, LIMIT.registrationPeer);
    if (!abuse.allowed) return Object.freeze({ status: 'verification_required', verification_handle: verificationHandle });

    const code = sixDigitCode(), now = this.#now();
    let result;
    try {
      result = await this.#store.beginRegistration({
        tenantId: this.#defaultTenantId,
        email,
        password,
        displayName,
        challengeDigest: keyedDigest(this.#challengeSecret, 'email-verification', code),
        verificationHandleDigest: keyedDigest(this.#challengeSecret, 'registration-handle', verificationHandle),
        nowMs: now,
        expiresAtMs: now + VERIFICATION_TTL_MS,
      });
    } catch (error) {
      const errorCode = (error as { code?: string }).code;
      if (errorCode === 'registration_unavailable' || errorCode === 'verification_rate_limited') {
        return Object.freeze({ status: 'verification_required', verification_handle: verificationHandle });
      }
      throw error;
    }
    const recipient = email.trim();
    const recipientKey = keyedDigest(this.#challengeSecret, 'email-recipient', recipient.toLowerCase()).toString('hex').slice(0, 32);
    await this.#email.sendVerification({ to: recipient, code, idempotencyKey: `verify/${recipientKey}/${result.sendCount}` });
    return Object.freeze({ status: 'verification_required', verification_handle: verificationHandle });
  }

  async resendOtp(email: string, verificationHandle: string, risk?: AuthRiskContext) {
    const abuse = await this.#accountAndPeerBudget('otp-resend', email, risk, LIMIT.resendAccount, LIMIT.resendPeer);
    if (!abuse.allowed) return Object.freeze({ status: 'accepted' });

    const code = sixDigitCode(), now = this.#now();
    if (!validOpaqueHandle(verificationHandle)) return Object.freeze({ status: 'accepted' });
    let result;
    try {
      result = await this.#store.resendVerification(
        email,
        keyedDigest(this.#challengeSecret, 'registration-handle', verificationHandle),
        keyedDigest(this.#challengeSecret, 'email-verification', code),
        now,
        now + VERIFICATION_TTL_MS,
      );
    } catch (error) {
      if ((error as { code?: string }).code === 'invalid_email' || (error as { code?: string }).code === 'verification_rate_limited') return Object.freeze({ status: 'accepted' });
      throw error;
    }
    if (result) await this.#email.sendVerification({ to: result.user.email, code, idempotencyKey: `verify/${result.user.user_id}/${result.sendCount}` });
    return Object.freeze({ status: 'accepted' });
  }

  async verifyOtp(email: string, otpCode: string, verificationHandle: string, risk?: AuthRiskContext, previousAuthorization?: string) {
    const abuse = await this.#accountAndPeerBudget('otp-verify', email, risk, LIMIT.verificationAccount, LIMIT.verificationPeer);
    if (!abuse.allowed) throw rateLimited(abuse.retryAfterMs);
    if (!/^\d{6}$/.test(otpCode ?? '') || !validOpaqueHandle(verificationHandle)) throw invalidVerification();
    const user = await this.#store.verifyEmail(
      email,
      keyedDigest(this.#challengeSecret, 'email-verification', otpCode),
      keyedDigest(this.#challengeSecret, 'registration-handle', verificationHandle),
      this.#now(),
    );
    return this.issueSession(user, previousAuthorization);
  }

  async resetPasswordRequest(email: string, risk?: AuthRiskContext) {
    const abuse = await this.#accountAndPeerBudget('password-reset-request', email, risk, LIMIT.resetAccount, LIMIT.resetPeer);
    if (!abuse.allowed) return Object.freeze({ status: 'accepted' });

    const token = opaqueToken(32), now = this.#now();
    let reset;
    try {
      const user = await this.#store.findUserByEmail(email);
      if (user?.status === 'active' && user.email_verified_at) {
        reset = await this.#store.createPasswordReset(email, keyedDigest(this.#challengeSecret, 'password-reset', token), now, now + RESET_TTL_MS);
      }
    } catch (error) { if ((error as { code?: string }).code !== 'invalid_email') throw error; }
    if (reset) {
      const url = new URL('/reset-password', this.#publicOrigin);
      url.hash = new URLSearchParams({ token }).toString();
      try { await this.#email.sendPasswordReset({ to: reset.user.email, resetUrl: url.toString(), idempotencyKey: `reset/${reset.resetId}` }); }
      catch { /* Public reset-request remains enumeration-resistant even during delivery failure. */ }
    }
    return Object.freeze({ status: 'accepted' });
  }

  async resetPassword(resetToken: string, newPassword: string, risk?: AuthRiskContext) {
    const tokenSubject = normalizeOpaqueSubject(resetToken);
    const tokenBudget = await this.#subjectBudget('password-reset-consume:token', tokenSubject, LIMIT.resetToken);
    const peerBudget = await this.#peerBudget('password-reset-consume:peer', risk, LIMIT.resetPeer);
    const retryAfterMs = Math.max(tokenBudget.retryAfterMs, peerBudget.retryAfterMs);
    if (!tokenBudget.allowed || !peerBudget.allowed) throw rateLimited(retryAfterMs);
    if (typeof resetToken !== 'string' || resetToken.length < 20 || resetToken.length > 256) throw invalidReset();
    const user = await this.#store.consumePasswordReset(keyedDigest(this.#challengeSecret, 'password-reset', resetToken), newPassword, this.#now());
    if (!user) throw invalidReset();
    return Object.freeze({ status: 'password_reset' });
  }

  async googleStart(returnTo?: string, risk?: AuthRiskContext) {
    const peerBudget = await this.#peerBudget('oauth-start:peer', risk, LIMIT.oauthStartPeer);
    if (!peerBudget.allowed) throw rateLimited(peerBudget.retryAfterMs);
    const state = opaqueToken(32), nonce = opaqueToken(32), now = this.#now();
    const safeReturnTo = sanitizeReturnTo(returnTo, this.#publicOrigin);
    await this.#store.createOAuthState(
      keyedDigest(this.#challengeSecret, 'google-state', state),
      keyedDigest(this.#challengeSecret, 'google-nonce', nonce),
      safeReturnTo,
      now,
      now + OAUTH_STATE_TTL_MS,
    );
    return this.#google.authorizationUrl({ state, nonce });
  }

  async googleCallback(state: string, code: string, risk?: AuthRiskContext, previousAuthorization?: string) {
    const stateBudget = await this.#subjectBudget('oauth-callback:state', normalizeOpaqueSubject(state), LIMIT.oauthState);
    const peerBudget = await this.#peerBudget('oauth-callback:peer', risk, LIMIT.oauthCallbackPeer);
    const retryAfterMs = Math.max(stateBudget.retryAfterMs, peerBudget.retryAfterMs);
    if (!stateBudget.allowed || !peerBudget.allowed) throw rateLimited(retryAfterMs);
    if (typeof state !== 'string' || state.length < 20 || state.length > 256) throw oauthDenied();
    const oauthState = await this.#store.consumeOAuthState(keyedDigest(this.#challengeSecret, 'google-state', state), this.#now());
    if (!oauthState) throw oauthDenied();
    const claims = await this.#google.exchangeAndVerify(code);
    const nonceDigest = keyedDigest(this.#challengeSecret, 'google-nonce', claims.nonce);
    if (!digestMatches(nonceDigest, oauthState.nonceDigest) || claims.email_verified !== true) throw oauthDenied();
    const domain = claims.email.split('@').pop()?.toLowerCase();
    const authoritativeEmail = domain === 'gmail.com' || Boolean(claims.hd);
    const user = await this.#store.resolveGoogleIdentity({ subject: claims.sub, email: claims.email, displayName: claims.name, authoritativeEmail, defaultTenantId: this.#defaultTenantId, nowMs: this.#now() });
    const redirect = new URL(oauthState.returnTo, this.#publicOrigin);
    const session = await this.issueSession(user, previousAuthorization);
    return Object.freeze({ redirectTo: redirect.toString(), session });
  }

  async exchangeBrowserGrant(code: string, previousAuthorization?: string) {
    if (!validOpaqueHandle(code)) throw oauthDenied();
    const user = await this.#store.consumeBrowserGrant(keyedDigest(this.#challengeSecret, 'browser-grant', code), this.#now());
    if (!user) throw oauthDenied();
    return this.issueSession(user, previousAuthorization);
  }

  async login(email: string, password: string, risk?: AuthRiskContext, previousAuthorization?: string) {
    const abuse = await this.#accountAndPeerBudget('password-login', email, risk, LIMIT.loginAccount, LIMIT.loginPeer);
    if (!abuse.allowed) throw rateLimited(abuse.retryAfterMs);

    let row: AuthCredentialRow | undefined;
    try { row = await this.#store.findCredentialByEmail(email); }
    catch (error) { if ((error as { code?: string }).code === 'invalid_email') row = undefined; else throw error; }
    const valid = await verifyPassword(password, row ? credentialFromRow(row) : undefined);
    if (!row || !valid) throw invalidCredentials();
    return this.issueSession(row, previousAuthorization);
  }

  async verify(authorization: string | undefined): Promise<AuthenticatedPrincipal> {
    const principal = this.#jwt.verify(authorization);
    if (!principal.sessionId) { if (this.#allowStatelessTestTokens) return principal; throw unauthenticated(); }
    const user = await this.#security.activeSession(principal.sessionId, principal.userId, principal.tenantId, this.#now(), this.#sessionIdleTtlMs);
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
    await this.#security.revokeSession(principal.sessionId, principal.userId, principal.tenantId, this.#now());
  }

  async sessions(authorization: string | undefined) {
    const principal = await this.verify(authorization);
    if (!principal.sessionId) return Object.freeze([]);
    const now = this.#now();
    const rows = await this.#security.listSessions(principal.userId, principal.tenantId);
    return Object.freeze(rows.map(row => Object.freeze({
      id: keyedDigest(this.#challengeSecret, 'session-public-reference', row.session_id).toString('hex').slice(0, 32),
      created_at: row.created_at.toISOString(),
      last_seen_at: row.last_seen_at.toISOString(),
      expires_at: row.expires_at.toISOString(),
      current: row.session_id === principal.sessionId,
      status: sessionStatus(row, now, this.#sessionIdleTtlMs),
    })));
  }

  async revokeAllSessions(authorization: string | undefined) {
    const principal = await this.verify(authorization);
    await this.#security.revokeAllSessions(principal.userId, principal.tenantId, this.#now());
    return Object.freeze({ status: 'sessions_revoked' });
  }

  get store() { return this.#store; }
  get securityStore() { return this.#security; }

  private async issueSession(user: AuthUserRow, previousAuthorization?: string) {
    if (user.status !== 'active') throw unauthenticated();
    const now = this.#now(), expiresAt = now + this.#sessionAbsoluteTtlMs;
    const previousSessionId = this.#sameUserSessionId(previousAuthorization, user);
    const session = previousSessionId
      ? await this.#security.rotateSession(previousSessionId, user, now, expiresAt)
      : await this.#security.createSession(user, now, expiresAt);
    const accessToken = signJwt({ sub: user.user_id, tenantId: user.tenant_id, sid: session.sessionId, iss: this.#jwtConfig.issuer, aud: this.#jwtConfig.audience, iat: Math.floor(now / 1000), exp: Math.floor(expiresAt / 1000) }, this.#jwtConfig.secret);
    return Object.freeze({ access_token: accessToken, token_type: 'Bearer', expires_at: session.expiresAt.toISOString(), user: publicUser(user) });
  }

  #sameUserSessionId(authorization: string | undefined, user: AuthUserRow): string | undefined {
    if (!authorization) return undefined;
    try {
      const principal = this.#jwt.verify(authorization);
      if (principal.sessionId && principal.userId === user.user_id && principal.tenantId === user.tenant_id) return principal.sessionId;
    } catch { /* Fresh authentication must not fail because an old browser cookie is stale. */ }
    return undefined;
  }

  async #accountAndPeerBudget(scope: string, account: string, risk: AuthRiskContext | undefined, accountPolicy: RateLimitPolicy, peerPolicy: RateLimitPolicy) {
    const accountDecision = await this.#subjectBudget(`${scope}:account`, normalizeAccountSubject(account), accountPolicy);
    const peerDecision = await this.#peerBudget(`${scope}:peer`, risk, peerPolicy);
    return Object.freeze({ allowed: accountDecision.allowed && peerDecision.allowed, retryAfterMs: Math.max(accountDecision.retryAfterMs, peerDecision.retryAfterMs) });
  }

  async #subjectBudget(scope: string, subject: string, limit: RateLimitPolicy) {
    const digest = keyedDigest(this.#challengeSecret, `abuse:${scope}`, subject);
    return this.#security.consumeRateLimit(scope, digest, this.#now(), limit);
  }

  async #peerBudget(scope: string, risk: AuthRiskContext | undefined, limit: RateLimitPolicy) {
    const peer = normalizePeer(risk?.peerAddress);
    if (!peer) return Object.freeze({ allowed: true, retryAfterMs: 0 });
    return this.#subjectBudget(scope, peer, limit);
  }
}

function policy(windowMs: number, maxAttempts: number, blockMs: number): RateLimitPolicy { return Object.freeze({ windowMs, maxAttempts, blockMs }); }
function normalizeAccountSubject(value: string) { return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 512) : ''; }
function normalizeOpaqueSubject(value: string) { return typeof value === 'string' ? value.slice(0, 512) : ''; }
function normalizePeer(value: string | undefined) { const peer = value?.trim(); return peer ? peer.slice(0, 128).toLowerCase() : undefined; }
function sessionStatus(row: Readonly<{ revoked_at: Date | null; expires_at: Date; last_seen_at: Date }>, nowMs: number, idleTtlMs: number) {
  if (row.revoked_at) return 'revoked';
  if (row.expires_at.getTime() <= nowMs) return 'expired';
  if (row.last_seen_at.getTime() <= nowMs - idleTtlMs) return 'idle_expired';
  return 'active';
}
function publicUser(row: AuthUserRow) { return Object.freeze({ id: row.user_id, user_id: row.user_id, tenant_id: row.tenant_id, email: row.email, full_name: row.display_name, status: row.status, email_verified: Boolean(row.email_verified_at) }); }
function signJwt(claims: Record<string, unknown>, secret: string) { const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString('base64url'); const header=encode({alg:'HS256',typ:'JWT'}),payload=encode(claims); const signature=createHmac('sha256',secret).update(`${header}.${payload}`).digest('base64url'); return `${header}.${payload}.${signature}`; }
function normalizeOrigin(value: string) { const url = new URL(value); if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error('AUTH_PUBLIC_ORIGIN must use HTTPS outside localhost'); url.pathname='/'; url.search=''; url.hash=''; return url.toString(); }
function sanitizeReturnTo(value: string | undefined, publicOrigin: string) {
  const target=value?.trim()||'/';
  if(!target.startsWith('/')||target.length>2048||/[\\\u0000-\u001f\u007f]/.test(target)) return '/';
  try { const base=new URL(publicOrigin),resolved=new URL(target,base); if(resolved.origin!==base.origin) return '/'; return `${resolved.pathname}${resolved.search}`; }
  catch { return '/'; }
}
function validOpaqueHandle(value: string) { return typeof value === 'string' && /^[A-Za-z0-9_-]{40,128}$/.test(value); }
function invalidCredentials() { return Object.assign(new Error('Invalid email or password'), { status: 401, code: 'invalid_credentials', retryable: false }); }
function invalidVerification() { return Object.assign(new Error('Verification code is invalid or expired'), { status: 400, code: 'invalid_verification', retryable: false }); }
function invalidReset() { return Object.assign(new Error('Password reset token is invalid or expired'), { status: 400, code: 'invalid_reset_token', retryable: false }); }
function oauthDenied() { return Object.assign(new Error('Google authentication failed'), { status: 401, code: 'oauth_failed', retryable: false }); }
function rateLimited(retryAfterMs: number) { return Object.assign(new Error('Too many authentication attempts'), { status: 429, code: 'auth_rate_limited', retryable: true, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) }); }
function unauthenticated() { return Object.assign(new Error('Authentication token is invalid'), { status: 401, code: 'unauthenticated', retryable: false }); }
