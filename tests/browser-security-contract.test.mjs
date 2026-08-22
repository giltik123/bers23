import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { productionBrowserCsp } from '../vite.config.js';

async function sourceFiles(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await sourceFiles(file));
    else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) output.push(file);
  }
  return output;
}

test('production SPA CSP permits local WASM while denying dynamic script and HTML policy creation', () => {
  const csp = productionBrowserCsp('/api/core');
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(csp, /'unsafe-eval'|'unsafe-inline'[^;]*script/);
  assert.match(csp, /worker-src 'self' blob:/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-src 'none'/);
  assert.match(csp, /require-trusted-types-for 'script'/);
  assert.match(csp, /trusted-types 'none'/);
});

test('production CSP adds only the explicit HTTPS Core origin and rejects unsafe API URLs', () => {
  const remote = productionBrowserCsp('https://core.example.test/api/core');
  assert.match(remote, /connect-src 'self' https:\/\/core\.example\.test(?:;|$)/);
  assert.doesNotMatch(remote, /connect-src[^;]*https:\s/,'connect-src must not become a wildcard HTTPS exfiltration channel');
  assert.throws(() => productionBrowserCsp('http://core.example.test/api/core'), /relative or HTTPS/);
  assert.throws(() => productionBrowserCsp('https://user:pass@core.example.test/api/core'), /credentials/);
});

test('first-party browser source contains no raw HTML or string-code execution sinks', async () => {
  const forbidden = [
    /dangerouslySetInnerHTML/,
    /\.innerHTML\s*=/,
    /\.outerHTML\s*=/,
    /insertAdjacentHTML\s*\(/,
    /document\.write\s*\(/,
    /\beval\s*\(/,
    /new\s+Function\s*\(/,
  ];
  const violations = [];
  for (const file of await sourceFiles('src')) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbidden) if (pattern.test(source)) violations.push(`${file}: ${pattern}`);
  }
  assert.deepEqual(violations, []);
});
