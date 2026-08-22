import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { HmacJwtVerifier } from './hmacJwtVerifier.ts';

const config = { secret: 'test-secret', issuer: 'https://issuer.test', audience: 'bers-core' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = claims => { const head = encode({ alg: 'HS256', typ: 'JWT' }); const body = encode(claims); return `${head}.${body}.${createHmac('sha256', config.secret).update(`${head}.${body}`).digest('base64url')}`; };
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

test('verifies issuer, audience, expiry, signature and server-owned identity', () => {
  const verifier = new HmacJwtVerifier(config, () => 1_000_000);
  const authorization = `Bearer ${token({ iss: config.issuer, aud: config.audience, exp: 2000, sub: 'user-1', tenantId: 'tenant-1', sid: 'session-1' })}`;
  assert.deepEqual(verifier.verify(authorization), { userId: 'user-1', tenantId: 'tenant-1', sessionId: 'session-1', scopes: undefined });
  for (const claims of [{ iss: 'other', aud: config.audience, exp: 2000, sub: 'u', tenantId: 't' }, { iss: config.issuer, aud: 'other', exp: 2000, sub: 'u', tenantId: 't' }, { iss: config.issuer, aud: config.audience, exp: 1, sub: 'u', tenantId: 't' }]) assert.throws(() => verifier.verify(`Bearer ${token(claims)}`), error => error.status === 401);
  assert.throws(() => verifier.verify(`Bearer ${token({ iss: config.issuer, aud: config.audience, exp: 2000, sub: 'u', tenantId: 't' })}x`), error => error.status === 401);
});

test('rejects non-canonical base64url aliases of the same JWT HMAC bytes', () => {
  const verifier = new HmacJwtVerifier(config, () => 1_000_000);
  const valid = token({ iss: config.issuer, aud: config.audience, exp: 2000, sub: 'user-1', tenantId: 'tenant-1', sid: 'session-1' });
  const [header, payload, signature] = valid.split('.');
  const index = alphabet.indexOf(signature.at(-1));
  assert.ok(index >= 0);
  const alias = `${signature.slice(0, -1)}${alphabet[index | 1]}`;
  assert.notEqual(alias, signature);
  assert.deepEqual(Buffer.from(alias, 'base64url'), Buffer.from(signature, 'base64url'));
  assert.throws(() => verifier.verify(`Bearer ${header}.${payload}.${alias}`), error => error.status === 401);
});
