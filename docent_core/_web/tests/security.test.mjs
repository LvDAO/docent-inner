import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { fetchSessionUser } from '../app/services/session-user.mjs';
import { safeInternalRedirect } from '../lib/safe-internal-redirect.mjs';

const FORBIDDEN_AUTH_HEADERS = ['x-middleware-user', 'x-middleware-cookies'];

test('accepts only same-origin redirect paths', () => {
  assert.equal(
    safeInternalRedirect('/dashboard?id=1#result'),
    '/dashboard?id=1#result'
  );
  assert.equal(
    safeInternalRedirect('/settings/api-keys'),
    '/settings/api-keys'
  );

  for (const value of [
    'https://example.com',
    '//example.com/path',
    'javascript:alert(1)',
    'data:text/html,hello',
    '/\\example.com',
    '/dashboard\nmalformed',
  ]) {
    assert.equal(safeInternalRedirect(value), null, value);
  }
});

test('session lookup requires a cookie and ignores failed backend requests', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response('{}', { status: 500 });
  };

  assert.equal(
    await fetchSessionUser(
      undefined,
      'http://backend',
      'docent_session',
      fetchImpl
    ),
    null
  );
  assert.equal(calls, 0);
  assert.equal(
    await fetchSessionUser(
      'session-id',
      'http://backend',
      'docent_session',
      fetchImpl
    ),
    null
  );
  assert.equal(calls, 1);
});

test('session lookup forwards only the verified session cookie', async () => {
  const expectedUser = {
    id: 'user-id',
    email: 'user@example.com',
    is_anonymous: false,
  };
  const fetchImpl = async (url, init) => {
    assert.equal(url, 'http://backend/rest/me');
    assert.equal(init.headers.Cookie, 'docent_session=session-id');
    return Response.json(expectedUser);
  };

  assert.deepEqual(
    await fetchSessionUser(
      'session-id',
      'http://backend',
      'docent_session',
      fetchImpl
    ),
    expectedUser
  );
});

test('server auth code contains no trusted middleware identity headers', async () => {
  const files = [
    new URL('../app/services/dal.ts', import.meta.url),
    new URL('../app/dashboard/[collection_id]/layout.tsx', import.meta.url),
    new URL('../middleware.ts', import.meta.url),
  ];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const header of FORBIDDEN_AUTH_HEADERS) {
      assert.equal(
        source.includes(header),
        false,
        `${header} in ${file.pathname}`
      );
    }
  }
});
