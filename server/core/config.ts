export type CoreServerConfig = Readonly<{
  nodeEnv: string; port: number; databaseUrl: string; provider: 'FAL'; falKey: string;
  falBaseUrl: string; jwtSecret: string; jwtIssuer: string; jwtAudience: string;
  artifactSigningSecret: string; trustedAssetHosts: readonly string[]; allowLegacyAssetUrls: boolean;
  allowedWebOrigins: readonly string[]; hardBudgetCredits: number; creditsPerEdit: number;
  bodyLimitBytes: number; maskUploadLimitBytes: number; maskMaxDimension: number; requestTimeoutMs: number; providerTimeoutMs: number; shutdownTimeoutMs: number;
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
  const allowedWebOrigins = list('ALLOWED_WEB_ORIGINS');
  if ((env.NODE_ENV ?? 'production') === 'production' && allowedWebOrigins.length === 0) throw new Error('Missing required server environment: ALLOWED_WEB_ORIGINS');
  return Object.freeze({
    nodeEnv: env.NODE_ENV ?? 'production', port: integer('PORT', 8080, 1, 65535), databaseUrl: required('DATABASE_URL'), provider,
    falKey: required('FAL_KEY'), falBaseUrl: env.FAL_BASE_URL?.trim() || 'https://queue.fal.run', jwtSecret: required('JWT_SECRET'),
    jwtIssuer: required('JWT_ISSUER'), jwtAudience: required('JWT_AUDIENCE'), artifactSigningSecret: required('ARTIFACT_SIGNING_SECRET'),
    trustedAssetHosts: Object.freeze(trustedAssetHosts), allowLegacyAssetUrls, allowedWebOrigins: Object.freeze(allowedWebOrigins),
    hardBudgetCredits: integer('HARD_BUDGET_CREDITS', 1, 1, 1000), creditsPerEdit: integer('CREDITS_PER_EDIT', 1, 1, 1000),
    bodyLimitBytes: integer('REQUEST_BODY_LIMIT_BYTES', 262_144, 1024, 2_097_152), maskUploadLimitBytes: integer('MASK_UPLOAD_LIMIT_BYTES', 67_108_864, 1024, 268_435_456), maskMaxDimension: integer('MASK_MAX_DIMENSION', 8192, 1, 16384), requestTimeoutMs: integer('REQUEST_TIMEOUT_MS', 130_000, 1000, 600_000),
    providerTimeoutMs: integer('PROVIDER_TIMEOUT_MS', 120_000, 1000, 600_000), shutdownTimeoutMs: integer('SHUTDOWN_TIMEOUT_MS', 30_000, 1000, 120_000),
  });
}
