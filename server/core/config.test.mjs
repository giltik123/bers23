import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCoreServerConfig } from './config.ts';
const valid = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://db.invalid/core', FAL_KEY: 'secret', JWT_SECRET: 'secret', JWT_ISSUER: 'issuer', JWT_AUDIENCE: 'audience', ARTIFACT_SIGNING_SECRET: 'secret', TRUSTED_ASSET_HOSTS: 'assets.example.test', ALLOWED_WEB_ORIGINS: 'https://app.example.test' };
test('loads server-only config and fails without required values', () => { assert.equal(loadCoreServerConfig(valid).port, 8080); for (const name of ['DATABASE_URL', 'FAL_KEY', 'JWT_SECRET']) { const env = { ...valid }; delete env[name]; assert.throws(() => loadCoreServerConfig(env), new RegExp(name)); } });
test('legacy URLs fail closed without trusted hosts', () => assert.throws(() => loadCoreServerConfig({ ...valid, ALLOW_LEGACY_ASSET_URLS: 'true', TRUSTED_ASSET_HOSTS: '' }), /TRUSTED_ASSET_HOSTS/));
