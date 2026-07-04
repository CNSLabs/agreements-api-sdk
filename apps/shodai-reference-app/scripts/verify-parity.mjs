import assert from 'node:assert/strict';

const baseUrl = process.env.AGREEMENTS_BACKEND_URL || 'http://localhost:4199';
const wallet = (process.env.AGREEMENTS_VERIFY_WALLET || '0x1111111111111111111111111111111111111111').toLowerCase();
const token = process.env.AGREEMENTS_VERIFY_TOKEN || makeDevToken();
if (!process.env.AGREEMENTS_VERIFY_TOKEN && process.env.NODE_ENV !== 'test') {
  throw new Error('AGREEMENTS_VERIFY_TOKEN is required outside NODE_ENV=test.');
}

function makeDevToken() {
  return `agreements-dev:${Buffer.from(JSON.stringify({
  userId: 'agreements-verify-user',
  email: 'verify@example.com',
  wallets: [{ address: wallet, chain: 'EVM', wallet_name: 'Agreements', wallet_provider: 'verify' }],
  })).toString('base64url')}`;
}

const signin = await request('POST', '/auth-api/auth/signin', { token, freshAuth: true });
assert.equal(signin.success, true);

const templates = await request('GET', '/agreements-api/templates');
assert.ok(Array.isArray(templates) && templates.length > 0, 'template catalog should list templates');const config = await request('GET', '/agreements-api/config');
const chainId = config.defaultChainId;
assert.ok(Number.isInteger(chainId), 'public config must include a defaultChainId');
const available = await request('GET', '/agreements-api/agreements/templates/available');
const allowedTemplateIds = new Set([
  ...(available.defaultTemplateIds || []),
  ...(available.whitelistedTemplateIds || []),
]);
assert.ok(allowedTemplateIds.size > 0, 'template access must be configured before running parity verification');
const selectedTemplateSummary = templates.find((entry) => allowedTemplateIds.has(entry.templateId));
assert.ok(selectedTemplateSummary, 'visible template catalog must include at least one allowed template');
const template = await request('GET', `/agreements-api/templates/${encodeURIComponent(selectedTemplateSummary.templateId)}`);
const draft = await request('POST', '/agreements-api/agreements', {
  agreement: template,
  displayName: 'Parity verification draft',
  chainId,
  initValues: {},
});

await request('PATCH', `/agreements-api/agreements/${draft.id}/display-name`, { displayName: 'Parity verification draft edited' });
const participants = await request('GET', `/agreements-api/agreements/${draft.id}/participants`);
if (participants.participantVariableKeys[0]) {
  await request('PUT', `/agreements-api/agreements/${draft.id}/participants`, {
    resolveWallets: true,
    participants: [{ variableKey: participants.participantVariableKeys[0], email: 'participant@example.com' }],
  });
}
await request('PUT', `/agreements-api/agreements/${draft.id}/observers`, { observers: ['observer@example.com'] });
const deployed = await request('POST', `/agreements-api/agreements/${draft.id}/deploy-with-permit`, {
  signer: wallet,
  deadline: Math.floor(Date.now() / 1000) + 3600,
  signature: { v: 27, r: `0x${'1'.repeat(64)}`, s: `0x${'2'.repeat(64)}` },
});
await request('POST', `/agreements-api/agreements/${draft.id}/input`, {
  inputId: 'verifyInput',
  values: { verification: true },
  signer: wallet,
  deadline: Math.floor(Date.now() / 1000) + 3600,
  signature: { v: 27, r: `0x${'3'.repeat(64)}`, s: `0x${'4'.repeat(64)}` },
});
await request('GET', `/agreements-api/agreements/${draft.id}/state`);
await request('GET', `/agreements-api/agreements/${draft.id}/inputs`);

console.log(JSON.stringify({
  ok: true,
  templateId: template.metadata.templateId,
  draftId: draft.id,
  deployedAddress: deployed.address,
}, null, 2));

async function request(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  assert.ok(response.ok, `${method} ${path} failed: ${response.status} ${text}`);
  return json;
}
