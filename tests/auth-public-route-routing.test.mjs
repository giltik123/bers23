import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('public auth routes remain renderable when canonical session check returns auth_required', async () => {
  const [app, protectedRoute, authContext] = await Promise.all([
    readFile('src/App.jsx', 'utf8'),
    readFile('src/components/ProtectedRoute.jsx', 'utf8'),
    readFile('src/lib/AuthContext.jsx', 'utf8'),
  ]);

  for (const route of ['/login', '/register', '/forgot-password', '/reset-password']) {
    assert.match(app, new RegExp(`<Route path=["']${route.replaceAll('/', '\\/')}["']`));
  }

  // Global routing must never turn auth_required into another login redirect.
  // ProtectedRoute is the only authority deciding whether private routes redirect.
  assert.doesNotMatch(app, /navigateToLogin/);
  assert.doesNotMatch(app, /authError\.type\s*===\s*['"]auth_required['"]/);
  assert.doesNotMatch(authContext, /navigateToLogin/);
  assert.match(app, /<ProtectedRoute unauthenticatedElement=\{<Navigate to=["']\\?\/login["'] replace \/>\}/);
  assert.match(protectedRoute, /return unauthenticatedElement/);
});
