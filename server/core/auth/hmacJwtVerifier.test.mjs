import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { HmacJwtVerifier } from './hmacJwtVerifier.ts';

const config = { secret: 'test-secret', issuer: 'https://issuer.test', audience: 'bers-core' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = claims => { const head = encode({ alg: 'HS256', typ: 'JWT' }); const body = encode(claims); return `${head}.${body}.${createHmac('sha256', config.secret).update(`${head}.${body}`).digest('base64url')}`; };
test('verifies issuer, audience, expiry, signature and server-owned identity', () => {
  const verifier = new HmacJwtVerifier(config, () => 1_000_000);
  const authorization = `Bearer ${token({ iss: config.issuer, aud: config.audience, exp: 2000, sub: 'user-1', tenantId: 'tenant-1', sid: 'session-1' })}`;
  assert.deepEqual(verifier.verify(authorization), { userId: 'user-1', tenantId: 'tenant-1', sessionId: 'session-1', scopes: undefined });
  for (const claims of [{ iss: 'other', aud: config.audience, exp: 2000, sub: 'u', tenantId: 't' }, { iss: config.issuer, aud: 'other', exp: 2000, sub: 'u', tenantId: 't' }, { iss: config.issuer, aud: config.audience, exp: 1, sub: 'u', tenantId: 't' }]) assert.throws(() => verifier.verify(`Bearer ${token(claims)}`), error => error.status === 401);
  assert.throws(() => verifier.verify(`Bearer ${token({ iss: config.issuer, aud: config.audience, exp: 2000, sub: 'u', tenantId: 't' })}x`), error => error.status === 401);
});
