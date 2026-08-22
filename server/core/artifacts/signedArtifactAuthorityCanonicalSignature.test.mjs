import assert from 'node:assert/strict';
import test from 'node:test';
import { SignedArtifactAuthority } from './signedArtifactAuthority.ts';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

test('artifact signatures reject non-canonical base64url aliases that decode to the same HMAC bytes', () => {
  const authority = new SignedArtifactAuthority('canonical-signature-secret', []);
  const scope = { tenantId: 'tenant', userId: 'user', projectId: 'project' };
  const valid = authority.issueStoredMask('storage', scope);
  const [payload, signature] = valid.split('.');
  const lastIndex = alphabet.indexOf(signature.at(-1));
  assert.ok(lastIndex >= 0 && lastIndex % 16 === 0, 'SHA-256 base64url signature must end in a canonical 2-bit character');
  const aliasSignature = `${signature.slice(0, -1)}${alphabet[lastIndex + 1]}`;
  assert.deepEqual(Buffer.from(aliasSignature, 'base64url'), Buffer.from(signature, 'base64url'), 'fixture must prove the textual alias decodes to identical signature bytes');
  assert.throws(() => authority.resolveStoredMask(`${payload}.${aliasSignature}`, scope), /not trusted/);
  assert.equal(authority.resolveStoredMask(valid, scope).storageId, 'storage');
});
