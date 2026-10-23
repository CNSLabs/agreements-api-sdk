import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClient, AgreementsApiError } from '../dist/index.js';

test('setup helpers preserve new/resumed statuses, public references and account authentication', async () => {
  const calls = [];
  let status = 201;
  const payload = { record: { id: 'subscription/id' }, permission: { startTime: 1, expiry: 86401 } };
  const client = new ApiClient({ baseUrl: 'https://fixture.example', apiKey: 'fixture-key', fetch: async (url, init) => {
    calls.push({ url: String(url), init });
    const list = init.method === 'GET' && !String(url).endsWith('/setup');
    return Response.json({ data: list ? [] : payload, ...(list ? { pageInfo: { limit: 1, nextCursor: null } } : {}) }, { status });
  } });
  const body = { planId: 'plan', subscriberWallet: '0x1111111111111111111111111111111111111111' };
  assert.deepEqual(await client.createOrResumeSubscription(body), { status: 201, data: payload });
  status = 200;
  assert.deepEqual(await client.createOrResumeSubscription(body), { status: 200, data: payload });
  await client.getSubscriptionSetup('subscription/id');
  await client.listSubscriptions({ subscriberWallet: body.subscriberWallet, reusableSetup: true, limit: 1 });
  assert.equal(calls[2].url, 'https://fixture.example/v0/subscriptions/subscription%2Fid/setup');
  assert.equal(new URL(calls[3].url).searchParams.get('reusableSetup'), 'true');
  for (const { init } of calls) assert.equal(init.headers['X-API-Key'], 'fixture-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), body);
});

test('setup helpers retain the existing SDK error contract', async () => {
  const client = new ApiClient({ baseUrl: 'https://fixture.example', apiKey: 'fixture-key', fetch: async () => Response.json({ error: { code: 'conflict', message: 'Plan is closed' } }, { status: 409 }) });
  await assert.rejects(client.createOrResumeSubscription({ planId: 'closed', subscriberWallet: 'buyer' }), error => error instanceof AgreementsApiError && error.status === 409 && error.message === 'Plan is closed');
});

test('Payment helpers forward the unchanged message and retain new/recovered statuses and cursors', async () => {
  const calls = [];
  const payment = { id: 'payment', status: 'pending', coveredPeriod: null };
  let status = 201;
  const client = new ApiClient({ baseUrl: 'https://fixture.example', apiKey: 'fixture-key', fetch: async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(init.method === 'GET' ? { data: [payment], pageInfo: { limit: 1, nextCursor: 'next' } } : { data: payment }, { status });
  } });
  const body = { subscriberWallet: 'buyer', resourceUrl: 'https://merchant.fixture/resource', payment: { x402Version: 2, payload: { signature: 'unchanged' } } };
  assert.deepEqual(await client.createOrRecoverSubscriptionPayment('subscription/id', body), { status: 201, data: payment });
  status = 200;
  assert.deepEqual(await client.createOrRecoverSubscriptionPayment('subscription/id', body), { status: 200, data: payment });
  assert.equal((await client.listSubscriptionPayments('subscription/id', { limit: 1, cursor: 'prior' })).pageInfo.nextCursor, 'next');
  assert.equal(calls[0].url, 'https://fixture.example/v0/subscriptions/subscription%2Fid/payments');
  assert.deepEqual(JSON.parse(calls[0].init.body), body);
  assert.equal(new URL(calls[2].url).searchParams.get('cursor'), 'prior');
});
