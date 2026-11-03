import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { classifySessionCheckFailure } from '../src/lib/sessionCheckFailure.js';

test('only canonical denial statuses redirect to login', () => {
  for (const status of [401, 403]) {
    assert.deepEqual(classifySessionCheckFailure({ status }), {
      type: 'auth_required', message: 'Authentication required',
    });
  }
  for (const error of [new TypeError('Failed to fetch'), { status: 500, message: 'secret' }, { status: 429 }, null]) {
    assert.deepEqual(classifySessionCheckFailure(error), {
      type: 'unknown', message: 'Unable to verify session',
    });
  }
});

test('AuthContext preserves transient failure and protected route offers a retry without login redirect', async () => {
  const [context, route] = await Promise.all([
    readFile(new URL('../src/lib/AuthContext.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ProtectedRoute.jsx', import.meta.url), 'utf8'),
  ]);
  const initialCheck = context.slice(context.indexOf('const checkAppState ='), context.indexOf('const checkUserAuth ='));
  assert.match(initialCheck, /await checkUserAuth\(\)/);
  assert.doesNotMatch(initialCheck, /setAuthError\(\{\s*type:\s*'auth_required'/);
  assert.match(context, /setAuthError\(classifySessionCheckFailure\(error\)\)/);
  assert.match(route, /if \(authError && !isAuthenticated\)/);
  assert.match(route, /authError\.type === 'unknown'/);
  assert.match(route, /role="alert"/);
  assert.match(route, /void checkUserAuth\(\)\.catch\(\(\) => \{\}\)/);
  assert.match(route, /return unauthenticatedElement/);
});
