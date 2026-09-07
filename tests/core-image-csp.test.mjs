import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsp, productionBrowserMetaCsp } from '../config/frontendSecurityPolicy.mjs';

test('same-origin Core does not expand img-src beyond the existing browser policy', () => {
  const directives = parseCsp(productionBrowserMetaCsp('/api/core'));
  assert.deepEqual(directives.get('img-src'), ["'self'", 'blob:', 'data:', 'https:']);
  assert.deepEqual(directives.get('connect-src'), ["'self'"]);
});

test('split-origin Core is admitted as one exact image and connect source', () => {
  const core = 'http://127.0.0.1:4188/api/core';
  const directives = parseCsp(productionBrowserMetaCsp(core));
  assert.deepEqual(directives.get('img-src'), ["'self'", 'blob:', 'data:', 'https:', 'http://127.0.0.1:4188']);
  assert.deepEqual(directives.get('connect-src'), ["'self'", 'http://127.0.0.1:4188']);
  assert.equal(directives.get('img-src').includes('http:'), false, 'CSP must not open wildcard HTTP image loading');
});
