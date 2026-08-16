import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import test from 'node:test';
import { join } from 'node:path';

const retiredName = ['base', '44'].join('');
const files = (root) => readdirSync(root).flatMap((name) => {
  const path = join(root, name);
  return statSync(path).isDirectory() ? files(path) : [path];
});

test('retired runtime has no source or production configuration references', () => {
  const production = [...files('src'), 'package.json', 'vite.config.js'];
  for (const path of production) assert.equal(readFileSync(path, 'utf8').toLowerCase().includes(retiredName), false, path);
});

test('browser code cannot import server transaction internals', () => {
  for (const path of files('src')) {
    const source = readFileSync(path, 'utf8');
    assert.equal(/from ['"].*server\/transactions/.test(source), false, path);
  }
});

test('SDK and build plugin packages are absent', () => {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
  assert.equal(Object.keys(dependencies).some((name) => name.toLowerCase().includes(retiredName)), false);
});
