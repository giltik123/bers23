import { createPublicKey, verify as verifySignature } from 'node:crypto';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

type GoogleJwk = Record<string, unknown> & { kty?: string; kid?: string; alg?: string; use?: string };
export type GoogleClaims = Readonly<{
  iss: string; aud: string; sub: string; exp: number; nonce: string;
  email: string; email_verified: boolean; hd?: string; name?: string;
}>;

export class GoogleOidcClient {
  private keys: { expiresAt: number; values: readonly GoogleJwk[] } | undefined;

  constructor(private readonly input: Readonly<{
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    fetcher: typeof fetch;
    now?: () => number;
  }>) {}

  authorizationUrl(input: Readonly<{ state: string; nonce: string }>) {
    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.search = new URLSearchParams({ client_id: this.input.clientId, redirect_uri: this.input.redirectUri, response_type: 'code', scope: 'openid email profile', state: input.state, nonce: input.nonce, prompt: 'select_account' }).toString();
    return url.toString();
  }

  async exchangeAndVerify(code: string): Promise<GoogleClaims> {
    if (typeof code !== 'string' || code.length < 1 || code.length > 4096) throw oauthDenied();
    const response = await this.input.fetcher(TOKEN_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.input.clientId, client_secret: this.input.clientSecret, code, grant_type: 'authorization_code', redirect_uri: this.input.redirectUri }),
    });
    if (!response.ok) throw oauthDenied();
    const tokenBody = await response.json().catch(() => undefined) as { id_token?: unknown } | undefined;
    if (typeof tokenBody?.id_token !== 'string') throw oauthDenied();
    return this.verifyIdToken(tokenBody.id_token);
  }

  async verifyIdToken(idToken: string): Promise<GoogleClaims> {
    const parts = idToken.split('.');
    if (parts.length !== 3 || parts.some(part => !part)) throw oauthDenied();
    const header = parseJson(parts[0]) as { alg?: unknown; kid?: unknown };
    const claims = parseJson(parts[1]) as Partial<GoogleClaims>;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw oauthDenied();
    const key = (await this.jwks()).find(item => item.kid === header.kid && item.kty === 'RSA');
    if (!key) {
      this.keys = undefined;
      const refreshed = (await this.jwks()).find(item => item.kid === header.kid && item.kty === 'RSA');
      if (!refreshed) throw oauthDenied();
      return this.verifyWithKey(parts, refreshed, claims);
    }
    return this.verifyWithKey(parts, key, claims);
  }

  private verifyWithKey(parts: string[], jwk: GoogleJwk, claims: Partial<GoogleClaims>): GoogleClaims {
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
    const signature = Buffer.from(parts[2], 'base64url');
    let valid = false;
    try { valid = verifySignature('RSA-SHA256', signed, createPublicKey({ key: jwk as any, format: 'jwk' }), signature); }
    catch { valid = false; }
    const nowSeconds = Math.floor((this.input.now ?? Date.now)() / 1000);
    if (!valid || typeof claims.iss !== 'string' || !ISSUERS.has(claims.iss) || claims.aud !== this.input.clientId || typeof claims.exp !== 'number' || claims.exp <= nowSeconds || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 || typeof claims.email !== 'string' || typeof claims.nonce !== 'string' || !claims.nonce) throw oauthDenied();
    return Object.freeze({
      iss: claims.iss, aud: claims.aud, sub: claims.sub, exp: claims.exp, nonce: claims.nonce, email: claims.email,
      email_verified: claims.email_verified === true,
      ...(typeof claims.hd === 'string' && claims.hd ? { hd: claims.hd } : {}),
      ...(typeof claims.name === 'string' && claims.name ? { name: claims.name } : {}),
    });
  }

  private async jwks(): Promise<readonly GoogleJwk[]> {
    const now = (this.input.now ?? Date.now)();
    if (this.keys && this.keys.expiresAt > now) return this.keys.values;
    const response = await this.input.fetcher(JWKS_ENDPOINT, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw oauthDenied();
    const body = await response.json().catch(() => undefined) as { keys?: unknown } | undefined;
    if (!Array.isArray(body?.keys)) throw oauthDenied();
    const values = body.keys.filter((item): item is GoogleJwk => Boolean(item && typeof item === 'object'));
    const maxAge = /(?:^|,)\s*max-age=(\d+)/i.exec(response.headers.get('cache-control') ?? '')?.[1];
    const ttl = Math.min(Math.max(Number(maxAge ?? 300), 60), 86_400) * 1000;
    this.keys = { expiresAt: now + ttl, values };
    return values;
  }
}

function parseJson(encoded: string): unknown {
  try { return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); }
  catch { throw oauthDenied(); }
}
function oauthDenied() { return Object.assign(new Error('Google authentication failed'), { status: 401, code: 'oauth_failed', retryable: false }); }
