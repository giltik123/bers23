import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

function atLeastFixedDomPurify(version) {
  const match = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)$/.exec(version);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  return major > 3 || (major === 3 && (minor > 4 || (minor === 4 && patch >= 17)));
}

test('production DOMPurify is locked to a non-vulnerable 3.4.17-or-newer version', () => {
  const root = lock.packages[''];
  const resolved = lock.packages['node_modules/dompurify'];
  assert.equal(root.dependencies.dompurify, manifest.dependencies.dompurify);
  assert.ok(resolved, 'DOMPurify remains available to the jsPDF optional dependency');
  assert.ok(atLeastFixedDomPurify(resolved.version), 'DOMPurify lock must include the security fix');
  assert.match(resolved.integrity, /^sha512-[A-Za-z0-9+/]+=*$/);
  assert.equal(resolved.resolved, `https://registry.npmjs.org/dompurify/-/dompurify-${resolved.version}.tgz`);
  assert.equal(lock.packages['node_modules/jspdf'].optionalDependencies.dompurify, '^3.3.1');
});

test('unused vulnerable Zod 3 is not present in the production lock graph', () => {
  assert.equal(Object.hasOwn(manifest.dependencies, 'zod'), false);
  assert.equal(Object.hasOwn(lock.packages[''].dependencies, 'zod'), false);
  assert.equal(Object.hasOwn(lock.packages, 'node_modules/zod'), false);
  for (const [name, entry] of Object.entries(lock.packages)) {
    for (const group of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      assert.equal(Object.hasOwn(entry[group] ?? {}, 'zod'), false, `${name} still requires Zod through ${group}`);
    }
  }
});
