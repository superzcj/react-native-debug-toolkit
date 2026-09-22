const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDemoServer } = require('./api.cjs');

test('demo checkout exposes an inspectable conflict and supports a successful retry', async (t) => {
  const server = createDemoServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const checkout = (scenario) => fetch(`${base}/checkout`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, productId: 'linen-chair', quantity: 1 }),
  });
  const failed = await checkout('sold-out');
  assert.equal(failed.status, 409);
  assert.equal((await failed.json()).available, 0);
  const success = await checkout('available');
  assert.equal(success.status, 201);
  assert.equal((await success.json()).status, 'confirmed');
  const invalid = await fetch(`${base}/checkout`, { method: 'POST', body: '{' });
  assert.equal(invalid.status, 400);
});

test('staging serves the same fixture with a distinct environment header', async (t) => {
  const server = createDemoServer({ environment: 'staging' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-demo-environment'), 'staging');
});

test('development conflict and staging retry remain real HTTP results with the selected account', async (t) => {
  const development = createDemoServer({ environment: 'development' });
  const staging = createDemoServer({ environment: 'staging' });
  for (const server of [development, staging]) {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
  }
  const checkout = (server, scenario) => fetch(`http://127.0.0.1:${server.address().port}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenario, accountId: 'studio' }),
  });
  const conflict = await checkout(development, 'sold-out');
  assert.equal(conflict.status, 409);
  assert.equal(conflict.headers.get('x-demo-environment'), 'development');
  const retry = await checkout(staging, 'available');
  assert.equal(retry.status, 201);
  assert.equal(retry.headers.get('x-demo-environment'), 'staging');
  assert.equal((await retry.json()).accountId, 'studio');
  const stillUnavailable = await checkout(staging, 'sold-out');
  assert.equal(stillUnavailable.status, 409);
});
