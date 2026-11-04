import assert from 'node:assert/strict';
import test from 'node:test';

import { isExpectedR3mAuthRequestAbort } from '../scripts/r3m-auth-browser-diagnostics.mjs';

const frontendOrigin = 'http://127.0.0.1:4211';
const coreOrigin = 'http://127.0.0.1:4212';

test('R3m tolerates only the exact aborted Core logout and protected Login navigation', () => {
  assert.equal(isExpectedR3mAuthRequestAbort({
    url: `${coreOrigin}/api/core/auth/logout`,
    failure: 'net::ERR_ABORTED',
  }, { frontendOrigin, coreOrigin }), true);

  assert.equal(isExpectedR3mAuthRequestAbort({
    url: `${frontendOrigin}/login?return_to=%2F`,
    failure: 'net::ERR_ABORTED',
  }, { frontendOrigin, coreOrigin }), true);
});

test('R3m keeps unrelated, broadened and non-abort network failures fail-closed', () => {
  const rejected = [
    { url: `${frontendOrigin}/login`, failure: 'net::ERR_ABORTED' },
    { url: `${frontendOrigin}/login?return_to=%2F&next=%2Feditor`, failure: 'net::ERR_ABORTED' },
    { url: `http://127.0.0.2:4211/login?return_to=%2F`, failure: 'net::ERR_ABORTED' },
    { url: `${frontendOrigin}/editor`, failure: 'net::ERR_ABORTED' },
    { url: `${coreOrigin}/api/core/auth/context`, failure: 'net::ERR_ABORTED' },
    { url: `${coreOrigin}/api/core/auth/logout`, failure: 'net::ERR_CONNECTION_RESET' },
    { url: `${frontendOrigin}/login?return_to=%2F`, failure: 'net::ERR_CONNECTION_RESET' },
    { url: 'not a URL', failure: 'net::ERR_ABORTED' },
    { url: `${frontendOrigin}/login?return_to=%2F`, failure: 'unknown' },
  ];

  for (const entry of rejected) {
    assert.equal(isExpectedR3mAuthRequestAbort(entry, { frontendOrigin, coreOrigin }), false, JSON.stringify(entry));
  }
});
