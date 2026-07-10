import assert from 'node:assert/strict';
import test from 'node:test';

test('proxies the complete REST tree to the internal backend', async () => {
  process.env.DOCENT_INTERNAL_API_HOST = 'http://backend:9999/';
  const { default: config } =
    await import('../next.config.mjs?internal-proxy-test');

  assert.deepEqual(await config.rewrites(), [
    {
      source: '/rest/:path*',
      destination: 'http://backend:9999/rest/:path*',
    },
  ]);
  assert.equal(config.experimental.proxyClientMaxBodySize, '50mb');
  assert.equal(config.experimental.proxyTimeout, 86_400_000);
});
