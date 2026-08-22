import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCoreServerConfig } from './config.ts';
const valid = {
  NODE_ENV: 'production', DATABASE_URL: 'postgresql://db.invalid/core', FAL_KEY: 'secret',
  JWT_SECRET: 'secret', JWT_ISSUER: 'issuer', JWT_AUDIENCE: 'audience',
  AUTH_CHALLENGE_SECRET: 'challenge-secret', AUTH_DEFAULT_TENANT_ID: 'public', AUTH_PUBLIC_ORIGIN: 'https://app.example.test',
  RESEND_API_KEY: 'resend-secret', AUTH_EMAIL_FROM: 'Bers <auth@example.test>',
  GOOGLE_OAUTH_CLIENT_ID: 'google-client', GOOGLE_OAUTH_CLIENT_SECRET: 'google-secret',
  ARTIFACT_SIGNING_SECRET: 'secret', TRUSTED_ASSET_HOSTS: 'assets.example.test', ALLOWED_WEB_ORIGINS: 'https://app.example.test'
};
test('loads server-only config and fails without required values', () => {
  assert.equal(loadCoreServerConfig(valid).port, 8080);
  for (const name of ['DATABASE_URL','FAL_KEY','JWT_SECRET','AUTH_CHALLENGE_SECRET','AUTH_DEFAULT_TENANT_ID','AUTH_PUBLIC_ORIGIN','RESEND_API_KEY','AUTH_EMAIL_FROM','GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET']) {
    const env = { ...valid }; delete env[name]; assert.throws(() => loadCoreServerConfig(env), new RegExp(name));
  }
});
test('auth public origin requires HTTPS outside localhost', () => assert.throws(() => loadCoreServerConfig({ ...valid, AUTH_PUBLIC_ORIGIN: 'http://app.example.test' }), /AUTH_PUBLIC_ORIGIN/));
test('legacy URLs fail closed without trusted hosts', () => assert.throws(() => loadCoreServerConfig({ ...valid, ALLOW_LEGACY_ASSET_URLS: 'true', TRUSTED_ASSET_HOSTS: '' }), /TRUSTED_ASSET_HOSTS/));
