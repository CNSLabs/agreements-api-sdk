import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClient } from '../dist/index.js';

test('Plan helpers use account-authenticated paths and preserve false filters and pagination', async () => {
  const calls = [];
  const plan = { id: 'plan/id', network: 'eip155:84532', asset: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    recipient: '0x1111111111111111111111111111111111111111', amount: '1000000000', periodSeconds: 60,
    acceptingNewSubscriptions: false, createdAt: '2026-10-15T12:00:00.000Z' };
  const client = new ApiClient({ baseUrl: 'https://fixture.example', apiKey: 'fixture-key', fetch: async (url, init) => {
    calls.push({ url: String(url), init });
    const list = String(url).includes('?');
    return Response.json({ data: list ? [plan] : plan, meta: { apiVersion: 'v0', requestId: 'fixture' },
      ...(list ? { pageInfo: { limit: 1, nextCursor: 'next-page' } } : {}) }, { status: init.method === 'POST' ? 201 : 200 });
  } });
  const { id, createdAt, ...terms } = plan;
  assert.deepEqual(await client.createSubscriptionPlan(terms), plan);
  assert.deepEqual(await client.getSubscriptionPlan(id), plan);
  const listed = await client.listSubscriptionPlans({ acceptingNewSubscriptions: false, limit: 1, cursor: 'prior-page' });
  assert.equal(listed.pageInfo.nextCursor, 'next-page');
  assert.deepEqual(await client.updateSubscriptionPlan(id, { acceptingNewSubscriptions: false }), plan);
  assert.deepEqual(calls.map(({ url, init }) => [init.method, url]), [
    ['POST', 'https://fixture.example/v0/subscription-plans'],
    ['GET', 'https://fixture.example/v0/subscription-plans/plan%2Fid'],
    ['GET', 'https://fixture.example/v0/subscription-plans?acceptingNewSubscriptions=false&limit=1&cursor=prior-page'],
    ['PATCH', 'https://fixture.example/v0/subscription-plans/plan%2Fid'],
  ]);
  for (const { init } of calls) assert.equal(init.headers['X-API-Key'], 'fixture-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), terms);
  assert.deepEqual(JSON.parse(calls[3].init.body), { acceptingNewSubscriptions: false });
});
