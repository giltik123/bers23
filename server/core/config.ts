export type CoreServerConfig = Readonly<{
  nodeEnv: string; port: number; databaseUrl: string; provider: 'FAL'; falKey: string;
  falBaseUrl: string; jwtSecret: string; jwtIssuer: string; jwtAudience: string;
  authChallengeSecret: string; authDefaultTenantId: string; authPublicOrigin: string;
  resendApiKey: string; authEmailFrom: string; googleOauthClientId: string; googleOauthClientSecret: string;
  artifactSigningSecret: string; trustedAssetHosts: readonly string[]; allowLegacyAssetUrls: boolean;
  allowedWebOrigins: readonly string[]; allowApiBearerAuth?: boolean; hardBudgetCredits: number; creditsPerEdit: number;
  bodyLimitBytes: number; maskUploadLimitBytes: number; maskMaxDimension: number; imageUploadLimitBytes: number; imageMaxDimension: number; imageMaxPixels: number; requestTimeoutMs: number; providerTimeoutMs: number; shutdownTimeoutMs: number;
}>;

/** Reads server-only configuration and reports names, never secret values. */
export function loadCoreServerConfig(env: NodeJS.ProcessEnv = process.env): CoreServerConfig {
  const required = (name: string): string => { const value = env[name]?.trim(); if (!value) throw new Error(`Missing required server environment: ${name}`); return value; };
  const list = (name: string): string[] => (env[name] ?? '').split(',').map(value => value.trim()).filter(Boolean);
  const integer = (name: string, fallback: number, min: number, max: number): number => { const value = Number(env[name] ?? fallback); if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid server environment: ${name}`); return value; };
  const boolean = (name: string, fallback = false): boolean => { const value = env[name]; if (value === undefined) return fallback; if (value !== 'true' && value !== 'false') throw new Error(`Invalid server environment: ${name}`); return value === 'true'; };
  const provider = (env.CREATIVE_PROVIDER ?? 'FAL').toUpperCase();
  if (provider !== 'FAL') throw new Error('Invalid server environment: CREATIVE_PROVIDER');
  const allowLegacyAssetUrls = boolean('ALLOW_LEGACY_ASSET_URLS');
  const trustedAssetHosts = list('TRUSTED_ASSET_HOSTS');
  if (allowLegacyAssetUrls && trustedAssetHosts.length === 0) throw new Error('TRUSTED_ASSET_HOSTS is required when legacy asset URLs are enabled');
  const allowedWebOrigins = list('ALLOWED_WEB_ORIGINS').map(value => exactWebOrigin(value));
  if ((env.NODE_ENV ?? 'production') === 'production' && allowedWebOrigins.length === 0) throw new Error('Missing required server environment: ALLOWED_WEB_ORIGINS');
  const authPublicOrigin = required('AUTH_PUBLIC_ORIGIN');
  let parsedOrigin: URL;
  try { parsedOrigin = new URL(authPublicOrigin); } catch { throw new Error('Invalid server environment: AUTH_PUBLIC_ORIGIN'); }
  if (parsedOrigin.protocol !== 'https:' && parsedOrigin.hostname !== 'localhost' && parsedOrigin.hostname !== '127.0.0.1') throw new Error('Invalid server environment: AUTH_PUBLIC_ORIGIN');
  if (parsedOrigin.username || parsedOrigin.password || parsedOrigin.search || parsedOrigin.hash || (parsedOrigin.pathname && parsedOrigin.pathname !== '/')) throw new Error('Invalid server environment: AUTH_PUBLIC_ORIGIN');
  const authDefaultTenantId = required('AUTH_DEFAULT_TENANT_ID');
  if (authDefaultTenantId.length > 200) throw new Error('Invalid server environment: AUTH_DEFAULT_TENANT_ID');
  const nodeEnv = env.NODE_ENV ?? 'production';
  return Object.freeze({
    nodeEnv, port: integer('PORT', 8080, 1, 65535), databaseUrl: required('DATABASE_URL'), provider,
    falKey: required('FAL_KEY'), falBaseUrl: env.FAL_BASE_URL?.trim() || 'https://queue.fal.run', jwtSecret: required('JWT_SECRET'),
    jwtIssuer: required('JWT_ISSUER'), jwtAudience: required('JWT_AUDIENCE'),
    authChallengeSecret: required('AUTH_CHALLENGE_SECRET'), authDefaultTenantId, authPublicOrigin: parsedOrigin.origin,
    resendApiKey: required('RESEND_API_KEY'), authEmailFrom: required('AUTH_EMAIL_FROM'),
    googleOauthClientId: required('GOOGLE_OAUTH_CLIENT_ID'), googleOauthClientSecret: required('GOOGLE_OAUTH_CLIENT_SECRET'),
    artifactSigningSecret: required('ARTIFACT_SIGNING_SECRET'), trustedAssetHosts: Object.freeze(trustedAssetHosts), allowLegacyAssetUrls,
    allowedWebOrigins: Object.freeze(allowedWebOrigins), allowApiBearerAuth: boolean('ALLOW_API_BEARER_AUTH', nodeEnv !== 'production'), hardBudgetCredits: integer('HARD_BUDGET_CREDITS', 1, 1, 1000), creditsPerEdit: integer('CREDITS_PER_EDIT', 1, 1, 1000),
    bodyLimitBytes: integer('REQUEST_BODY_LIMIT_BYTES', 262_144, 1024, 2_097_152), maskUploadLimitBytes: integer('MASK_UPLOAD_LIMIT_BYTES', 67_108_864, 1024, 268_435_456), maskMaxDimension: integer('MASK_MAX_DIMENSION', 8192, 1, 16384), imageUploadLimitBytes: integer('IMAGE_UPLOAD_LIMIT_BYTES', 25_165_824, 1024, 104_857_600), imageMaxDimension: integer('IMAGE_MAX_DIMENSION', 8192, 1, 16384), imageMaxPixels: integer('IMAGE_MAX_PIXELS', 67_108_864, 1, 268_435_456), requestTimeoutMs: integer('REQUEST_TIMEOUT_MS', 130_000, 1000, 600_000),
    providerTimeoutMs: integer('PROVIDER_TIMEOUT_MS', 120_000, 1000, 600_000), shutdownTimeoutMs: integer('SHUTDOWN_TIMEOUT_MS', 30_000, 1000, 120_000),
  });
}

function exactWebOrigin(value: string): string {
  if (value === '*') throw new Error('Invalid server environment: ALLOWED_WEB_ORIGINS');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid server environment: ALLOWED_WEB_ORIGINS'); }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) {
    throw new Error('Invalid server environment: ALLOWED_WEB_ORIGINS');
  }
  return url.origin;
}
