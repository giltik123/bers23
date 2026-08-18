import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { SignedArtifactAuthority } from './signedArtifactAuthority.ts';

const secret = 'artifact-secret'; const scope = { tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1' };
const sign = claim => { const payload = Buffer.from(JSON.stringify(claim)).toString('base64url'); return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`; };
test('only resolves signed, owned, project-scoped artifacts on trusted HTTPS storage', async () => {
  const authority = new SignedArtifactAuthority(secret, ['assets.example.test'], () => 1000);
  const valid = sign({ id: 'asset-1', url: 'https://assets.example.test/object.png', ...scope, exp: 2000 });
  assert.equal(authority.resolve(valid, scope).url, 'https://assets.example.test/object.png'); assert.equal(await authority.owns(scope, [valid]), true);
  assert.equal(await authority.owns({ ...scope, projectId: 'other' }, [valid]), false);
  const arbitrary = sign({ id: 'asset-2', url: 'https://attacker.test/object.png', ...scope, exp: 2000 }); assert.throws(() => authority.resolve(arbitrary, scope));
});
