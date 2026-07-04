import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MongoClient } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '../..');
const serviceToken = 'test-service-token';
const require = createRequire(import.meta.url);
const vendoredTemplateIds = [
  'did:template:customer-invoice-prototype-v1',
  'did:template:mou-v1',
  'did:template:purchase-order-auto-pay-actions-v1',
  'did:template:service-retainer-manual-balance-v0-1',
  'did:template:service-retainer-onchain-balance-v0-1',
];
let backendSourceRegistered = false;

test('Nest backend fails fast when required production config is missing', async () => {
  const port = 4590 + Math.floor(Math.random() * 200);
  const child = spawn('pnpm', ['--filter', 'shodai-reference-backend', 'start'], {
    cwd: appRoot,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      SHELL: process.env.SHELL,
      NODE_ENV: 'production',
      AGREEMENTS_BACKEND_PORT: String(port),
      MONGO_URI: '',
      MONGO_DB_NAME: '',
      DYNAMIC_ENVIRONMENT_ID: '',
      VITE_DYNAMIC_ENVIRONMENT_ID: '',
      DYNAMIC_API_TOKEN: '',
      EXTERNAL_API_BASE_URL: '',
      EXTERNAL_API_KEY: '',
      SHODAI_WEBHOOK_SECRET: '',
      FRONTEND_BASE_URL: '',
      SERVICE_AUTH_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  const [code] = await once(child, 'exit');
  assert.notEqual(code, 0, logs);
  assert.match(logs, /Missing required Shodai reference app config/);
  assert.match(logs, /MONGO_URI/);
  assert.match(logs, /DYNAMIC_ENVIRONMENT_ID/);
  assert.match(logs, /EXTERNAL_API_KEY/);
  assert.match(logs, /SHODAI_WEBHOOK_SECRET/);
  assert.match(logs, /FRONTEND_BASE_URL/);
});

test('Nest backend refuses test-only mock external API configuration at runtime', async () => {
  const port = 4590 + Math.floor(Math.random() * 200);
  const child = spawn('pnpm', ['--filter', 'shodai-reference-backend', 'start'], {
    cwd: appRoot,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      SHELL: process.env.SHELL,
      NODE_ENV: 'production',
      AGREEMENTS_BACKEND_PORT: String(port),
      MONGO_URI: 'mongodb://localhost:27017',
      MONGO_DB_NAME: `standalone_agreements_runtime_config_${process.pid}_${port}`,
      DYNAMIC_ENVIRONMENT_ID: 'runtime-dynamic-env',
      DYNAMIC_API_TOKEN: 'runtime-dynamic-token',
      EXTERNAL_API_BASE_URL: 'mock',
      EXTERNAL_API_KEY: 'runtime-external-key',
      SHODAI_WEBHOOK_SECRET: 'whsec_runtime',
      FRONTEND_BASE_URL: 'http://localhost:5184/agreements/',
      SERVICE_AUTH_TOKEN: serviceToken,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  const [code] = await once(child, 'exit');
  assert.notEqual(code, 0, logs);
  assert.match(logs, /EXTERNAL_API_BASE_URL=mock is only allowed under NODE_ENV=test/);
});

test('Nest backend rejects local or private external API base URLs during normal runtime', async () => {
  const urls = [
    'http://localhost:4005',
    'http://127.0.0.1:4005',
    'http://0.0.0.0:4005',
    'http://10.0.0.5:4005',
    'http://172.16.0.5:4005',
    'http://192.168.1.5:4005',
  ];

  for (const externalApiBaseUrl of urls) {
    const port = 4590 + Math.floor(Math.random() * 200);
    const child = spawn('pnpm', ['--filter', 'shodai-reference-backend', 'start'], {
      cwd: appRoot,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        SHELL: process.env.SHELL,
        NODE_ENV: 'production',
        AGREEMENTS_BACKEND_PORT: String(port),
        MONGO_URI: 'mongodb://localhost:27017',
        MONGO_DB_NAME: `standalone_agreements_runtime_config_${process.pid}_${port}`,
        DYNAMIC_ENVIRONMENT_ID: 'runtime-dynamic-env',
        DYNAMIC_API_TOKEN: 'runtime-dynamic-token',
        EXTERNAL_API_BASE_URL: externalApiBaseUrl,
        ALLOW_LOCAL_EXTERNAL_API: 'false',
        EXTERNAL_API_KEY: 'runtime-external-key',
        SHODAI_WEBHOOK_SECRET: 'whsec_runtime',
        FRONTEND_BASE_URL: 'http://localhost:5184/agreements/',
        SERVICE_AUTH_TOKEN: serviceToken,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let logs = '';
    child.stdout.on('data', (chunk) => {
      logs += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      logs += chunk.toString();
    });

    const [code] = await once(child, 'exit');
    assert.notEqual(code, 0, `${externalApiBaseUrl}\n${logs}`);
    assert.match(logs, /EXTERNAL_API_BASE_URL must target the real Shodai API unless ALLOW_LOCAL_EXTERNAL_API=true is set/, externalApiBaseUrl);
  }
});

test('Nest backend rejects test-only Dynamic tokens during normal runtime', async (t) => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 1000 });
  try {
    await mongoClient.connect();
  } catch {
    t.skip('MongoDB is not available on MONGO_URI');
    return;
  }

  const port = 4790 + Math.floor(Math.random() * 200);
  const dbName = `standalone_agreements_runtime_auth_${process.pid}_${port}`;
  const child = spawn('pnpm', ['--filter', 'shodai-reference-backend', 'start'], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      AGREEMENTS_BACKEND_PORT: String(port),
      MONGO_URI: mongoUri,
      MONGO_DB_NAME: dbName,
      DYNAMIC_ENVIRONMENT_ID: 'runtime-dynamic-env',
      DYNAMIC_API_TOKEN: 'runtime-dynamic-token',
      EXTERNAL_API_BASE_URL: 'https://external-api.example.test',
      EXTERNAL_API_KEY: 'runtime-external-key',
      SHODAI_WEBHOOK_SECRET: 'whsec_runtime',
      FRONTEND_BASE_URL: 'http://localhost:5184/agreements/',
      SERVICE_AUTH_TOKEN: serviceToken,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  try {
    await waitForHealth(port, child, () => logs);
    const runtimeDevToken = tokenFor({
      userId: 'runtime-dev-token-user',
      email: 'runtime-dev-token@example.com',
      wallet: '0x1111111111111111111111111111111111111111',
    });
    const response = await fetch(`http://localhost:${port}/auth-api/auth/signin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: runtimeDevToken }),
    });
    const responseBody = await readJsonResponse(response);
    assert.equal(response.status, 200, JSON.stringify(responseBody));
    assert.deepEqual(responseBody, {
      success: false,
      error: 'Development Dynamic tokens are disabled',
    });

    const protectedResponse = await fetch(`http://localhost:${port}/auth-api/auth/validate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${runtimeDevToken}` },
    });
    assert.equal(protectedResponse.status, 401, await protectedResponse.text());
    assert.equal(await mongoClient.db(dbName).collection('platform_users').countDocuments(), 0);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit').catch(() => undefined);
    await mongoClient.db(dbName).dropDatabase();
    await mongoClient.close();
  }
});

test('Legacy migration validates exports before writes, preserves IDs, and is idempotent', async (t) => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 1000 });
  try {
    await mongoClient.connect();
  } catch {
    t.skip('MongoDB is not available on MONGO_URI');
    return;
  }

  const dbName = `standalone_agreements_migration_test_${process.pid}_${Math.floor(Math.random() * 10000)}`;
  const validDir = await fs.mkdtemp(path.join(os.tmpdir(), 'standalone-agreements-migration-valid-'));
  const invalidDir = await fs.mkdtemp(path.join(os.tmpdir(), 'standalone-agreements-migration-invalid-'));
  const malformedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'standalone-agreements-migration-malformed-'));
  const malformedJsonDir = await fs.mkdtemp(path.join(os.tmpdir(), 'standalone-agreements-migration-malformed-json-'));
  const duplicateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'standalone-agreements-migration-duplicate-'));
  try {
    const db = mongoClient.db(dbName);
    await writeExport(validDir, migrationFixtureExport());

    const valid = await runMigration(validDir, { dbName, dryRun: true });
    assert.equal(valid.code, 0, valid.output);
    const summary = JSON.parse(valid.stdout);
    assert.equal(summary.dryRun, true);
    assert.equal(summary.collections.template_access, 2);
    assert.equal(summary.mappings.platform_users, 1);
    assert.equal(await db.collection('platform_users').countDocuments(), 0);
    assert.equal(await db.collection('migration_mappings').countDocuments(), 0);

    const importResult = await runMigration(validDir, { dbName, dryRun: false });
    assert.equal(importResult.code, 0, importResult.output);
    const importSummary = JSON.parse(importResult.stdout);
    assert.equal(importSummary.dryRun, false);
    assert.equal(importSummary.mappingDocuments.latest, true);
    assert.equal(await db.collection('platform_users').countDocuments(), 1);
    assert.equal(await db.collection('user_identities').countDocuments(), 1);
    assert.equal(await db.collection('user_contacts').countDocuments(), 1);
    assert.equal(await db.collection('user_wallets').countDocuments(), 1);
    assert.equal(await db.collection('agreements').countDocuments(), 1);
    assert.equal(await db.collection('agreement_inputs').countDocuments(), 1);
    assert.equal(await db.collection('template_access').countDocuments(), 2);
    assert.equal(await db.collection('migration_mappings').countDocuments(), 2);
    assert.equal(await db.collection('platform_users').countDocuments({ _id: { $exists: true }, id: 'user-1' }), 1);
    const importedUser = await db.collection('platform_users').findOne({ id: 'user-1' });
    assert.notDeepEqual(importedUser._id, { $oid: '64f000000000000000000001' });
    assert.equal(importedUser.email, 'owner@example.com');
    assert.deepEqual(await db.collection('template_access').findOne(
      { kind: 'global-default' },
      { projection: { _id: 0 } },
    ), {
      kind: 'global-default',
      templateIds: ['did:template:mou-v1'],
    });

    const rerunResult = await runMigration(validDir, { dbName, dryRun: false });
    assert.equal(rerunResult.code, 0, rerunResult.output);
    assert.equal(await db.collection('platform_users').countDocuments(), 1);
    assert.equal(await db.collection('template_access').countDocuments(), 2);
    assert.equal(await db.collection('migration_mappings').countDocuments(), 2);
    const mapping = await db.collection('migration_mappings').findOne({ id: importSummary.id }, { projection: { _id: 0 } });
    assert.equal(mapping.preservedIds, true);
    assert.equal(mapping.mappings.platform_users[0].sourceMongoId, '64f000000000000000000001');
    assert.deepEqual(mapping.mappings.agreements[0].targetFilter, { id: 'agreement-1' });

    await writeExport(invalidDir, {
      users: [{ id: 'user-1' }],
      user_contacts: [{ id: 'contact-1', userId: 'missing-user', type: 'email', valueNormalized: 'missing@example.com' }],
      agreements: [{ id: 'agreement-1' }],
      agreement_inputs: [{ id: 'input-1', agreementId: 'missing-agreement', inputId: 'sign' }],
      template_access: [
        { kind: 'global-default', platformUserId: 'user-1', templateIds: ['did:template:mou-v1'] },
        { kind: 'user-whitelist', platformUserId: 'missing-user', templateIds: ['did:template:mou-v1'] },
      ],
    });

    const invalidCountBefore = await db.collection('platform_users').countDocuments();
    const invalid = await runMigration(invalidDir, { dbName, dryRun: false });
    assert.notEqual(invalid.code, 0, invalid.output);
    assert.match(invalid.output, /references missing platform user missing-user/);
    assert.match(invalid.output, /references missing agreement missing-agreement/);
    assert.match(invalid.output, /global-default must not include platformUserId/);
    assert.equal(await db.collection('platform_users').countDocuments(), invalidCountBefore);

    await fs.writeFile(path.join(malformedDir, 'users.json'), JSON.stringify([{ id: 'user-1' }, null], null, 2));
    const malformed = await runMigration(malformedDir, { dbName, dryRun: false });
    assert.notEqual(malformed.code, 0, malformed.output);
    assert.match(malformed.output, /users\.json\[1\] must be an object/);
    assert.equal(await db.collection('platform_users').countDocuments(), invalidCountBefore);

    await fs.writeFile(path.join(malformedJsonDir, 'users.json'), '[{"id":"user-1"},');
    const malformedJson = await runMigration(malformedJsonDir, { dbName, dryRun: false });
    assert.notEqual(malformedJson.code, 0, malformedJson.output);
    assert.match(malformedJson.output, /users\.json contains malformed JSON/);
    assert.equal(await db.collection('platform_users').countDocuments(), invalidCountBefore);

    await writeExport(duplicateDir, {
      users: [{ id: 'user-1' }, { id: 'user-1' }],
      template_access: [
        { kind: 'global-default', templateIds: ['did:template:mou-v1'] },
        { kind: 'global-default', templateIds: ['did:template:msa-v1'] },
        { kind: 'user-whitelist', platformUserId: 'missing-user', templateIds: [42] },
      ],
    });
    const duplicate = await runMigration(duplicateDir, { dbName, dryRun: false });
    assert.notEqual(duplicate.code, 0, duplicate.output);
    assert.match(duplicate.output, /platform_users contains duplicate domain key user-1/);
    assert.match(duplicate.output, /template_access contains duplicate domain key global-default/);
    assert.match(duplicate.output, /templateIds must contain non-empty strings/);
    assert.equal(await db.collection('platform_users').countDocuments(), invalidCountBefore);
  } finally {
    await fs.rm(validDir, { recursive: true, force: true });
    await fs.rm(invalidDir, { recursive: true, force: true });
    await fs.rm(malformedDir, { recursive: true, force: true });
    await fs.rm(malformedJsonDir, { recursive: true, force: true });
    await fs.rm(duplicateDir, { recursive: true, force: true });
    await mongoClient.db(dbName).dropDatabase();
    await mongoClient.close();
  }
});

test('Agreements API client emits the outbound external API contract used by the reference app bridge', async () => {
  const { ApiClient } = await import(pathToFileURL(path.join(
    appRoot,
    'backend/node_modules/@cns-labs/agreements-api-client/dist/client.js',
  )).href);
  const calls = [];
  const client = new ApiClient({
    baseUrl: 'https://external-api.example.test',
    apiKey: 'external-key',
    fetch: async (url, init = {}) => {
      calls.push({
        url: String(url),
        method: init.method,
        headers: init.headers,
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (String(url).endsWith('/deploy-with-permit')) {
        return jsonResponse(201, successEnvelope({ id: 'agr_1', address: '0x1111111111111111111111111111111111111111', chainId: init.body ? JSON.parse(String(init.body)).chainId : undefined, state: 'Active' }));
      }
      if (String(url).endsWith('/input')) {
        return jsonResponse(201, successEnvelope({ agreementAddress: 'agr_1', inputId: 'submit', status: 'MINED' }));
      }
      if (String(url).endsWith('/agr_1')) {
        return jsonResponse(200, successEnvelope({ id: 'agr_1', address: '0x1111111111111111111111111111111111111111', chainId: 59141, state: 'Active' }));
      }
      if (String(url).endsWith('/state')) {
        return jsonResponse(200, successEnvelope({ state: 'Active' }));
      }
      return jsonResponse(200, listEnvelope([]));
    },
  });

  const deployResult = await client.deployWithPermit({ agreement: { metadata: { id: 'template-1' } }, displayName: 'SDK contract test', chainId: 59141, signer: '0x1111111111111111111111111111111111111111', deadline: 1, signature: { v: 27, r: `0x${'1'.repeat(64)}`, s: `0x${'2'.repeat(64)}` } });
  const inputResult = await client.submitAgreementInput('agr_1', { inputId: 'submit', values: { ok: true }, signer: '0x1111111111111111111111111111111111111111' });
  const agreementResult = await client.getAgreement('agr_1');
  const stateResult = await client.getAgreementState('agr_1');
  const inputsPage = await client.listAgreementInputs('agr_1', { userId: 'platform-user-1' });

  assert.deepEqual(calls.map((call) => [call.method, call.url]), [
    ['POST', 'https://external-api.example.test/v0/agreements/deploy-with-permit'],
    ['POST', 'https://external-api.example.test/v0/agreements/agr_1/input'],
    ['GET', 'https://external-api.example.test/v0/agreements/agr_1'],
    ['GET', 'https://external-api.example.test/v0/agreements/agr_1/state'],
    ['GET', 'https://external-api.example.test/v0/agreements/agr_1/inputs?userId=platform-user-1'],
  ]);
  for (const call of calls) {
    assert.equal(call.headers['X-API-Key'], 'external-key');
    assert.equal(call.headers.Accept, 'application/json');
  }
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.equal(calls[1].headers['Content-Type'], 'application/json');
  assert.equal(calls[0].body.chainId, 59141);
  assert.equal(calls[0].body.signer, '0x1111111111111111111111111111111111111111');
  assert.deepEqual(calls[1].body.values, { ok: true });
  assert.equal(deployResult.id, 'agr_1');
  assert.equal(inputResult.inputId, 'submit');
  assert.equal(agreementResult.id, 'agr_1');
  assert.equal(stateResult.state, 'Active');
  assert.deepEqual(inputsPage.data, []);
  assert.equal(inputsPage.pageInfo.nextCursor, null);
});

test('Notification catalog normalizes templates for external webhook deployment', async () => {
  const previousDir = process.env.NOTIFICATION_TEMPLATES_DIR;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'shodai-notification-templates-'));
  try {
    process.env.NOTIFICATION_TEMPLATES_DIR = tempDir;
    await fs.writeFile(path.join(tempDir, 'mou.notifications.json'), JSON.stringify({
      metadata: {
        id: 'ntpl:mou-v1',
        agreementTemplateId: 'did:template:mou-v1',
        version: '1.0.0',
      },
      rules: [
        {
          id: 'agreement-deployed',
          name: 'Agreement Deployed',
          trigger: { type: 'onTransition', inputs: ['__deploy'] },
          recipients: ['*'],
          notification: { channel: 'email', subject: 'Ready', body: 'Go' },
        },
      ],
    }));
    const { NotificationCatalogService } = requireBackendSource('notifications/notification-catalog.service.ts');
    const service = new NotificationCatalogService();

    const template = await service.getExternalWebhookTemplateByAgreementTemplateId('did:template:mou-v1');

    assert.equal(template.metadata.id, 'ntpl:mou-v1');
    assert.equal(template.rules[0].notification.channel, 'external_webhook');
  } finally {
    if (previousDir === undefined) {
      delete process.env.NOTIFICATION_TEMPLATES_DIR;
    } else {
      process.env.NOTIFICATION_TEMPLATES_DIR = previousDir;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('Notification catalog exposes monorepo templates in default local setup', async () => {
  const previousDir = process.env.NOTIFICATION_TEMPLATES_DIR;
  try {
    delete process.env.NOTIFICATION_TEMPLATES_DIR;
    const { NotificationCatalogService } = requireBackendSource('notifications/notification-catalog.service.ts');
    const service = new NotificationCatalogService();

    const template = await service.getExternalWebhookTemplateByAgreementTemplateId(
      'did:template:service-retainer-manual-balance-v0-1',
    );

    assert.equal(template.metadata.agreementTemplateId, 'did:template:service-retainer-manual-balance-v0-1');
    assert.ok(template.rules.some((rule) => rule.notification.attachmentStrategy?.type === 'customerInvoicePdf'));
    assert.ok(template.rules.every((rule) => rule.notification.channel === 'external_webhook'));
  } finally {
    if (previousDir === undefined) {
      delete process.env.NOTIFICATION_TEMPLATES_DIR;
    } else {
      process.env.NOTIFICATION_TEMPLATES_DIR = previousDir;
    }
  }
});

test('External deploy attaches matching external webhook notification template', async () => {
  const { ExternalAgreementsService } = requireBackendSource('external/external-agreements.service.ts');
  const agreement = {
    id: 'draft-with-notifications-1',
    status: 'Draft',
    chainId: 59141,
    displayName: 'Draft With Notifications',
    owner: '0x1111111111111111111111111111111111111111',
    json: {
      metadata: { templateId: 'did:template:mou-v1' },
      execution: { initialize: { initialState: 'PENDING' }, states: { PENDING: {} }, inputs: {} },
      variables: {},
    },
    variables: {},
    participants: [{ variableKey: 'partyA', walletAddress: '0x1111111111111111111111111111111111111111', status: 'accepted' }],
    observers: ['observer@example.com'],
  };
  const deployBodies = [];
  const service = new ExternalAgreementsService(
    {
      externalApiBaseUrl: 'https://external-api.example.test',
      externalApiKey: 'external-key',
      defaultAgreementChainId: 59141,
      normalizeAgreementChainId: () => 59141,
    },
    {
      findByIdentifier: async () => ({ agreement, ambiguous: false }),
      findOne: async () => agreement,
      upsertOne: async (_filter, doc) => Object.assign(agreement, doc),
    },
    { upsertInputMirror: async () => undefined },
    { insertOne: async () => undefined },
    {
      getExternalWebhookTemplateByAgreementTemplateId: async () => ({
        metadata: { id: 'ntpl:mou-v1', agreementTemplateId: 'did:template:mou-v1', version: '1.0.0' },
        rules: [
          {
            id: 'agreement-deployed',
            name: 'Agreement Deployed',
            trigger: { type: 'onTransition', inputs: ['__deploy'] },
            recipients: ['*'],
            notification: { channel: 'external_webhook', subject: 'Ready', body: 'Go' },
          },
        ],
      }),
    },
  );
  service.externalApiClient = async () => ({
    validateDeployment: async () => ({ variables: {}, participants: [], observers: [] }),
    deployWithPermit: async (body) => {
      deployBodies.push(body);
      return { id: 'agr_notification_1', address: '0x2222222222222222222222222222222222222222', chainId: 59141, state: 'PENDING' };
    },
  });

  await service.deployWithPermit('draft-with-notifications-1', {
    signer: '0x1111111111111111111111111111111111111111',
    deadline: 1,
    signature: { v: 27, r: `0x${'1'.repeat(64)}`, s: `0x${'2'.repeat(64)}` },
  }, {
    wallets: [{ address: '0x1111111111111111111111111111111111111111' }],
  });

  assert.equal(deployBodies.length, 1);
  assert.equal(deployBodies[0].notificationTemplate.metadata.id, 'ntpl:mou-v1');
  assert.equal(deployBodies[0].notificationTemplate.rules[0].notification.channel, 'external_webhook');
});

test('Notification email service sends SES email and records delivery audit', async () => {
  const { NotificationEmailService } = requireBackendSource('notifications/notification-email.service.ts');
  const deliveryRecords = new Map();
  const repository = {
    findByWebhookEventId: async (eventId) => deliveryRecords.get(eventId) || null,
    markSending: async (eventId, document) => {
      deliveryRecords.set(eventId, {
        ...(deliveryRecords.get(eventId) || {}),
        ...document,
        webhookEventId: eventId,
        status: 'sending',
        attemptCount: (deliveryRecords.get(eventId)?.attemptCount || 0) + 1,
      });
    },
    markSent: async (eventId, patch) => {
      deliveryRecords.set(eventId, { ...deliveryRecords.get(eventId), ...patch, status: 'sent' });
    },
    markFailed: async (eventId, error) => {
      deliveryRecords.set(eventId, { ...deliveryRecords.get(eventId), status: 'failed', error: String(error) });
    },
  };
  const sentCommands = [];
  const service = new NotificationEmailService({
    awsRegion: 'us-east-2',
    sesFromAddress: '"Shodai Agreements" <notifications@example.com>',
    sesConfigurationSet: '',
    frontendBaseUrl: 'http://localhost:5184/agreements/',
  }, repository, {
    findOne: async (filter) => filter.externalAgreementId === 'agr_1'
      ? { id: 'local-agreement-1', externalAgreementId: 'agr_1' }
      : null,
  });
  service.client = {
    send: async (command) => {
      sentCommands.push(command);
      return { MessageId: 'ses-message-1' };
    },
  };

  const result = await service.deliverTriggeredNotification({
    id: 'evt_notification_1',
    type: 'agreement.notification.triggered',
    apiVersion: '2026-06-01',
    createdAt: '2026-06-24T10:00:00.000Z',
    data: {
      agreementId: 'agr_1',
      agreementName: 'Test Agreement',
      templateId: 'did:template:mou-v1',
      notificationTemplateId: 'ntpl:mou-v1',
      ruleId: 'agreement-deployed',
      triggerType: 'onTransition',
      recipient: 'Recipient@Example.com',
      notification: {
        subject: 'Ready',
        title: 'Ready to sign',
        body: 'Please sign.',
        ctaLabel: 'Sign now',
        attachmentStrategy: { type: 'customerInvoicePdf', variant: 'manual-balance-invoice-v1' },
      },
      variables: {
        invoiceNumber: 'INV-100',
        invoiceDate: '2026-06-24',
        invoiceLineItems: 'date,description,quantity,rate,amount\n2026-06-24,Design work,2,100,200',
        retainerCeiling: 1000,
        retainerFloor: 250,
        retainerBalanceBeforeInvoice: 300,
        serviceProviderName: 'Provider LLC',
        clientName: 'Client Inc.',
        tokenSymbol: 'USDC',
      },
      transition: { fromState: '', toState: 'PENDING', inputId: '__deploy', occurredAt: '2026-06-24T10:00:00.000Z' },
    },
  });

  assert.equal(result.messageId, 'ses-message-1');
  assert.equal(sentCommands.length, 1);
  assert.equal(deliveryRecords.get('evt_notification_1').status, 'sent');
  assert.equal(deliveryRecords.get('evt_notification_1').recipient, 'recipient@example.com');
  assert.equal(deliveryRecords.get('evt_notification_1').localAgreementId, 'local-agreement-1');
  const commandInput = sentCommands[0].input;
  assert.ok(commandInput.Content.Raw?.Data, 'expected raw MIME email when attachmentStrategy is present');
  const rawEmail = Buffer.from(commandInput.Content.Raw.Data).toString('utf8');
  assert.match(rawEmail, /Content-Type: multipart\/mixed/);
  assert.match(rawEmail, /Content-Disposition: attachment; filename="/);
  assert.match(rawEmail, /Subject: Ready/);
});

test('Webhook event repository enforces processing lease ownership before completion', async (t) => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 1000 });
  try {
    await mongoClient.connect();
  } catch {
    t.skip('MongoDB is not available on MONGO_URI');
    return;
  }

  const dbName = `standalone_agreements_webhook_lease_${process.pid}_${Math.floor(Math.random() * 10000)}`;
  try {
    const { WebhookEventRepository } = requireBackendSource('database/repositories/webhook-event.repository.ts');
    const db = mongoClient.db(dbName);
    const repo = new WebhookEventRepository({ collection: async (name) => db.collection(name) });
    const now = new Date().toISOString();

    const cases = [
      {
        name: 'processed',
        apply: (eventId, lockToken) => repo.markProcessed(eventId, lockToken, { processedAction: 'current_worker' }),
        expected: { status: 'processed', processedAction: 'current_worker' },
      },
      {
        name: 'retry',
        apply: (eventId, lockToken) => repo.markRetryScheduled(eventId, lockToken, '2026-06-02T18:30:00.000Z', 'agreement_not_found', new Error('missing'), { processedAction: 'retry_worker' }),
        expected: { status: 'retry_scheduled', processedAction: 'retry_worker', retryReason: 'agreement_not_found' },
      },
      {
        name: 'ignored',
        apply: (eventId, lockToken) => repo.markIgnored(eventId, lockToken, 'stale_delivery', { processedAction: 'ignore_worker' }),
        expected: { status: 'ignored', processedAction: 'ignore_worker', ignoredReason: 'stale_delivery' },
      },
      {
        name: 'dead',
        apply: (eventId, lockToken) => repo.markDeadLetter(eventId, lockToken, 'reconciliation_failed', new Error('failed'), { processedAction: 'dead_worker' }),
        expected: { status: 'dead_letter', processedAction: 'dead_worker', deadLetterReason: 'reconciliation_failed' },
      },
    ];

    for (const entry of cases) {
      const eventId = `evt_lease_guard_${entry.name}`;
      await db.collection('webhook_events').insertOne({
        eventId,
        status: 'processing',
        lockToken: 'current-lock-token',
        lockedAt: now,
        receivedAt: now,
        updatedAt: now,
        payload: { type: 'agreement.transitioned' },
      });

      assert.equal(await entry.apply(eventId, 'stale-lock-token'), false);
      assert.deepEqual(await db.collection('webhook_events').findOne(
        { eventId },
        { projection: { _id: 0, status: 1, lockToken: 1, processedAction: 1 } },
      ), {
        status: 'processing',
        lockToken: 'current-lock-token',
      });

      assert.equal(await entry.apply(eventId, 'current-lock-token'), true);
      assert.deepEqual(await db.collection('webhook_events').findOne(
        { eventId },
        { projection: { _id: 0, status: 1, lockToken: 1, processedAction: 1, retryReason: 1, ignoredReason: 1, deadLetterReason: 1 } },
      ), entry.expected);
    }
  } finally {
    await mongoClient.db(dbName).dropDatabase();
    await mongoClient.close();
  }
});

test('Agreement input mirror upserts dedupe concurrently by agreement, chain, and stable key', async (t) => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 1000 });
  try {
    await mongoClient.connect();
  } catch {
    t.skip('MongoDB is not available on MONGO_URI');
    return;
  }

  const dbName = `standalone_agreements_input_dedupe_${process.pid}_${Math.floor(Math.random() * 10000)}`;
  let collections = null;
  try {
    const { MongoCollectionsService } = requireBackendSource('database/mongo-collections.service.ts');
    const { AgreementInputRepository } = requireBackendSource('database/repositories/agreement-input.repository.ts');
    collections = new MongoCollectionsService({
      mongoUri,
      mongoDbName: dbName,
      nodeEnv: 'test',
    });
    await collections.ensureIndexes();
    const repo = new AgreementInputRepository(collections);
    const key = { agreementId: 'agreement-dedupe-1', chainId: 59141, dedupeKey: `tx:0x${'1'.repeat(64)}` };
    const now = new Date().toISOString();

    await Promise.all(Array.from({ length: 8 }, (_, index) => repo.upsertInputMirror(key, {
      ...key,
      agreementAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      inputId: 'accept',
      txHash: `0x${'1'.repeat(64)}`,
      status: 'MINED',
      values: { index },
      createdAt: now,
      updatedAt: new Date(Date.now() + index).toISOString(),
    })));

    const mirrored = await mongoClient.db(dbName).collection('agreement_inputs').find(
      { agreementId: 'agreement-dedupe-1', chainId: 59141, dedupeKey: key.dedupeKey },
      { projection: { _id: 0, agreementId: 1, chainId: 1, dedupeKey: 1 } },
    ).toArray();
    assert.deepEqual(mirrored, [key]);

    const legacyTxHash = `0x${'A'.repeat(64)}`;
    const normalizedLegacyTxHash = legacyTxHash.toLowerCase();
    const legacyKey = { agreementId: 'agreement-dedupe-legacy', chainId: 59141, dedupeKey: `tx:${normalizedLegacyTxHash}` };
    await mongoClient.db(dbName).collection('agreement_inputs').insertOne({
      agreementId: legacyKey.agreementId,
      chainId: legacyKey.chainId,
      agreementAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      inputId: 'legacyAccept',
      txHash: legacyTxHash,
      status: 'MINED',
      values: { before: true },
      createdAt: now,
      updatedAt: now,
    });
    await repo.upsertInputMirror(
      legacyKey,
      {
        ...legacyKey,
        agreementAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        inputId: 'legacyAccept',
        txHash: normalizedLegacyTxHash,
        status: 'MINED',
        values: { after: true },
        createdAt: now,
        updatedAt: now,
      },
      {
        agreementId: legacyKey.agreementId,
        chainId: legacyKey.chainId,
        txHash: { $regex: `^${normalizedLegacyTxHash}$`, $options: 'i' },
      },
    );
    assert.equal(await mongoClient.db(dbName).collection('agreement_inputs').countDocuments({ agreementId: legacyKey.agreementId }), 1);
    assert.deepEqual(await mongoClient.db(dbName).collection('agreement_inputs').findOne(
      { agreementId: legacyKey.agreementId },
      { projection: { _id: 0, agreementId: 1, chainId: 1, dedupeKey: 1, txHash: 1, values: 1 } },
    ), {
      ...legacyKey,
      txHash: normalizedLegacyTxHash,
      values: { after: true },
    });
  } finally {
    await collections?.onModuleDestroy();
    await mongoClient.db(dbName).dropDatabase();
    await mongoClient.close();
  }
});

test('Webhook reconciliation does not write local mirrors after lease loss', async (t) => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 1000 });
  try {
    await mongoClient.connect();
  } catch {
    t.skip('MongoDB is not available on MONGO_URI');
    return;
  }

  const dbName = `standalone_agreements_webhook_lease_side_effect_${process.pid}_${Math.floor(Math.random() * 10000)}`;
  try {
    const db = mongoClient.db(dbName);
    const service = createMockExternalAgreementsService(db);
    await insertWebhookAgreement(db, {
      id: 'webhook-lease-side-effect-local-1',
      externalAgreementId: 'external-agreement-lease-side-effect-1',
      address: '0x1212121212121212121212121212121212121212',
      displayName: 'Webhook Lease Side Effect Local Agreement',
      variables: { scope: 'Before lease loss' },
    });
    const agreement = await db.collection('agreements').findOne(
      { id: 'webhook-lease-side-effect-local-1' },
      { projection: { _id: 0 } },
    );

    const result = await service.reconcileAgreementMirrorFromWebhook(
      agreement,
      transitionEvent({
        id: 'evt_webhook_lease_side_effect_1',
        agreementId: 'external-agreement-lease-side-effect-1',
        agreementName: 'Webhook Lease Side Effect Agreement',
        createdAt: '2026-06-02T18:10:00.000Z',
        fromState: 'PENDING_ACCEPTANCE',
        toState: 'ACCEPTED',
        inputId: 'accept',
      }),
      { isLeaseCurrent: async () => false },
    );
    assert.equal(result.skippedReason, 'lease_lost');
    assert.deepEqual(await db.collection('agreements').findOne(
      { id: 'webhook-lease-side-effect-local-1' },
      { projection: { _id: 0, state: 1, lastWebhookEventId: 1, lastWebhookEventAt: 1, variables: 1 } },
    ), {
      state: 'PENDING_ACCEPTANCE',
      variables: { scope: 'Before lease loss' },
    });
    assert.equal(await db.collection('agreement_inputs').countDocuments({ agreementId: 'webhook-lease-side-effect-local-1' }), 0);
  } finally {
    await mongoClient.db(dbName).dropDatabase();
    await mongoClient.close();
  }
});

test('Webhook reconciliation keeps the newer mirror when an older event races after read', async (t) => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 1000 });
  try {
    await mongoClient.connect();
  } catch {
    t.skip('MongoDB is not available on MONGO_URI');
    return;
  }

  const dbName = `standalone_agreements_webhook_stale_race_${process.pid}_${Math.floor(Math.random() * 10000)}`;
  try {
    const db = mongoClient.db(dbName);
    const service = createMockExternalAgreementsService(db);
    await insertWebhookAgreement(db, {
      id: 'webhook-stale-race-local-1',
      externalAgreementId: 'external-agreement-stale-race-1',
      address: '0x3434343434343434343434343434343434343434',
      displayName: 'Webhook Stale Race Local Agreement',
      variables: { scope: 'Before stale race' },
    });
    await db.collection('agreements').updateOne(
      { id: 'webhook-stale-race-local-1' },
      { $set: { lastWebhookEventAt: '2026-06-02T18:01:00.000Z', lastWebhookEventId: 'evt_webhook_old_read', state: 'PENDING_ACCEPTANCE' } },
    );
    const agreementReadBeforeNewerEvent = await db.collection('agreements').findOne(
      { id: 'webhook-stale-race-local-1' },
      { projection: { _id: 0 } },
    );
    await db.collection('agreements').updateOne(
      { id: 'webhook-stale-race-local-1' },
      {
        $set: {
          lastWebhookEventAt: '2026-06-02T18:05:00.000Z',
          lastWebhookEventId: 'evt_webhook_newer_winner',
          state: 'COMPLETE',
          variables: { scope: 'Newer event won' },
        },
      },
    );

    const result = await service.reconcileAgreementMirrorFromWebhook(
      agreementReadBeforeNewerEvent,
      transitionEvent({
        id: 'evt_webhook_stale_race_loser',
        agreementId: 'external-agreement-stale-race-1',
        agreementName: 'Webhook Stale Race Agreement',
        createdAt: '2026-06-02T18:04:00.000Z',
        fromState: 'PENDING_ACCEPTANCE',
        toState: 'ACCEPTED',
        inputId: 'accept',
      }),
      { isLeaseCurrent: async () => true },
    );
    assert.equal(result.skippedReason, 'stale_delivery');
    assert.deepEqual(await db.collection('agreements').findOne(
      { id: 'webhook-stale-race-local-1' },
      { projection: { _id: 0, state: 1, lastWebhookEventId: 1, lastWebhookEventAt: 1, variables: 1 } },
    ), {
      state: 'COMPLETE',
      lastWebhookEventId: 'evt_webhook_newer_winner',
      lastWebhookEventAt: '2026-06-02T18:05:00.000Z',
      variables: { scope: 'Newer event won' },
    });
  } finally {
    await mongoClient.db(dbName).dropDatabase();
    await mongoClient.close();
  }
});

test('Nest backend persists template access through Mongo-backed admin module', async (t) => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 1000 });
  try {
    await mongoClient.connect();
  } catch {
    t.skip('MongoDB is not available on MONGO_URI');
    return;
  }

  const port = 4390 + Math.floor(Math.random() * 200);
  const dbName = `standalone_agreements_nest_test_${process.pid}_${port}`;
  const child = spawn('pnpm', ['--filter', 'shodai-reference-backend', 'start'], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      AGREEMENTS_BACKEND_PORT: String(port),
      MONGO_URI: mongoUri,
      MONGO_DB_NAME: dbName,
      SERVICE_AUTH_TOKEN: serviceToken,
      EXTERNAL_API_BASE_URL: 'mock',
      SHODAI_WEBHOOK_SECRET: 'whsec_test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  try {
    await waitForHealth(port, child, () => logs);

    const token = tokenFor({
      userId: 'nest-mongo-smoke-user',
      email: 'nest-mongo-smoke@example.com',
      wallet: '0x1111111111111111111111111111111111111111',
    });
    const signinResponse = await fetch(`http://localhost:${port}/auth-api/auth/signin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, freshAuth: true }),
    });
    const signinBody = await readJsonResponse(signinResponse);
    assert.equal(signinResponse.status, 200, JSON.stringify(signinBody));
    assert.equal(signinBody.success, true);
    assert.equal(signinBody.user.email, 'nest-mongo-smoke@example.com');
    assert.ok(signinBody.platformUserId);

    const catalogDefaultAvailableResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/templates/available`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const catalogDefaultAvailableBody = await readJsonResponse(catalogDefaultAvailableResponse);
    assert.equal(catalogDefaultAvailableResponse.status, 200, JSON.stringify(catalogDefaultAvailableBody));
    assert.deepEqual(catalogDefaultAvailableBody, {
      defaultTemplateIds: vendoredTemplateIds,
      whitelistedTemplateIds: [],
    });

    const templatesResponse = await fetch(`http://localhost:${port}/agreements-api/templates`);
    const templatesBody = await readJsonResponse(templatesResponse);
    assert.equal(templatesResponse.status, 200, JSON.stringify(templatesBody));
    assert.ok(templatesBody.some((template) => template.templateId === 'did:template:mou-v1'));

    const templateResponse = await fetch(`http://localhost:${port}/agreements-api/templates/${encodeURIComponent('did:template:mou-v1')}`);
    const templateBody = await readJsonResponse(templateResponse);
    assert.equal(templateResponse.status, 200, JSON.stringify(templateBody));
    assert.equal(templateBody.metadata.templateId, 'did:template:mou-v1');

    const telemetryPingResponse = await fetch(`http://localhost:${port}/agreements-api/telemetry/ping`, {
      headers: { 'x-correlation-id': 'nest-smoke-correlation' },
    });
    const telemetryPingBody = await readJsonResponse(telemetryPingResponse);
    assert.equal(telemetryPingResponse.status, 200, JSON.stringify(telemetryPingBody));
    assert.equal(telemetryPingBody.service, 'agreements-api');
    assert.equal(telemetryPingBody.correlationId, 'nest-smoke-correlation');

    const telemetrySmokeResponse = await fetch(`http://localhost:${port}/agreements-api/telemetry/smoke/full-stack?failAt=auth-api`);
    const telemetrySmokeBody = await readJsonResponse(telemetrySmokeResponse);
    assert.equal(telemetrySmokeResponse.status, 500, JSON.stringify(telemetrySmokeBody));

    const unauthorizedDefaultsResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/admin/template-access/defaults`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ templateIds: ['did:template:mou-v1'] }),
    });
    assert.equal(unauthorizedDefaultsResponse.status, 401, await unauthorizedDefaultsResponse.text());

    const wrongServiceTokenResponse = await fetch(`http://localhost:${port}/auth-api/auth/users/get-or-create-with-wallet`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-service-token': 'wrong-service-token',
      },
      body: JSON.stringify({ email: 'blocked@example.com' }),
    });
    assert.equal(wrongServiceTokenResponse.status, 401, await wrongServiceTokenResponse.text());

    const catalogDefaultAdminResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/admin/template-access/defaults`, {
      headers: { 'x-service-token': serviceToken },
    });
    const catalogDefaultAdminBody = await readJsonResponse(catalogDefaultAdminResponse);
    assert.equal(catalogDefaultAdminResponse.status, 200, JSON.stringify(catalogDefaultAdminBody));
    assert.deepEqual(catalogDefaultAdminBody, {
      kind: 'global-default',
      templateIds: vendoredTemplateIds,
      source: 'catalog-default',
    });

    const defaultsResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/admin/template-access/defaults`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-service-token': serviceToken,
      },
      body: JSON.stringify({ templateIds: ['did:example:mou-v1'] }),
    });
    const defaultsBody = await readJsonResponse(defaultsResponse);
    assert.equal(defaultsResponse.status, 200, JSON.stringify(defaultsBody));
    assert.deepEqual(defaultsBody, {
      kind: 'global-default',
      templateIds: ['did:template:mou-v1'],
    });

    const whitelistResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/admin/template-access/${signinBody.platformUserId}`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-service-token': serviceToken,
      },
      body: JSON.stringify({ templateIds: ['did:example:service-retainer-manual-balance'] }),
    });
    const whitelistBody = await readJsonResponse(whitelistResponse);
    assert.equal(whitelistResponse.status, 200, JSON.stringify(whitelistBody));
    assert.deepEqual(whitelistBody.templateIds, ['did:template:service-retainer-manual-balance-v0-1']);

    const availableResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/templates/available`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const availableBody = await readJsonResponse(availableResponse);
    assert.equal(availableResponse.status, 200, JSON.stringify(availableBody));
    assert.deepEqual(availableBody, {
      defaultTemplateIds: ['did:template:mou-v1'],
      whitelistedTemplateIds: ['did:template:service-retainer-manual-balance-v0-1'],
    });

    const missingAuthAvailableResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/templates/available`);
    assert.equal(missingAuthAvailableResponse.status, 401, await missingAuthAvailableResponse.text());

    const malformedAuthListResponse = await fetch(`http://localhost:${port}/agreements-api/agreements`, {
      headers: { authorization: 'Bearer ' },
    });
    assert.equal(malformedAuthListResponse.status, 401, await malformedAuthListResponse.text());

    const draftResponse = await fetch(`http://localhost:${port}/agreements-api/agreements`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ templateId: 'did:template:mou-v1', displayName: 'Nest Mongo draft' }),
    });
    const draftBody = await readJsonResponse(draftResponse);
    assert.equal(draftResponse.status, 201, JSON.stringify(draftBody));
    assert.equal(draftBody.status, 'Draft');
    assert.equal(draftBody.displayName, 'Nest Mongo draft');
    assert.equal(draftBody.json.metadata.templateId, 'did:template:mou-v1');

    const tamperedDraftResponse = await fetch(`http://localhost:${port}/agreements-api/agreements`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        templateId: 'did:template:mou-v1',
        agreement: {
          metadata: { templateId: 'did:template:mou-v1', name: 'Tampered Template' },
          content: { data: 'This should not be persisted.' },
        },
        displayName: 'Tampered body draft',
      }),
    });
    const tamperedDraftBody = await readJsonResponse(tamperedDraftResponse);
    assert.equal(tamperedDraftResponse.status, 201, JSON.stringify(tamperedDraftBody));
    assert.deepEqual(tamperedDraftBody.json, templateBody);

    const serviceRetainerTemplateResponse = await fetch(`http://localhost:${port}/agreements-api/templates/${encodeURIComponent('did:template:service-retainer-manual-balance-v0-1')}`);
    const serviceRetainerTemplateBody = await readJsonResponse(serviceRetainerTemplateResponse);
    assert.equal(serviceRetainerTemplateResponse.status, 200, JSON.stringify(serviceRetainerTemplateBody));
    assert.equal(serviceRetainerTemplateBody.metadata.templateId, 'did:template:service-retainer-manual-balance-v0-1');

    const serviceRetainerDraftResponse = await fetch(`http://localhost:${port}/agreements-api/agreements`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ templateId: 'did:example:service-retainer-manual-balance', displayName: 'Manual balance retainer draft' }),
    });
    const serviceRetainerDraftBody = await readJsonResponse(serviceRetainerDraftResponse);
    assert.equal(serviceRetainerDraftResponse.status, 201, JSON.stringify(serviceRetainerDraftBody));
    assert.equal(serviceRetainerDraftBody.json.metadata.templateId, 'did:template:service-retainer-manual-balance-v0-1');

    const unauthorizedTemplateResponse = await fetch(`http://localhost:${port}/agreements-api/templates/${encodeURIComponent('did:template:purchase-order-auto-pay-actions-v1')}`);
    const unauthorizedTemplateBody = await readJsonResponse(unauthorizedTemplateResponse);
    assert.equal(unauthorizedTemplateResponse.status, 200, JSON.stringify(unauthorizedTemplateBody));
    const unauthorizedDraftCountBefore = await mongoClient.db(dbName).collection('agreements').countDocuments();
    const unauthorizedDraftResponse = await fetch(`http://localhost:${port}/agreements-api/agreements`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ templateId: 'did:template:purchase-order-auto-pay-actions-v1', displayName: 'Forbidden purchase order draft' }),
    });
    assert.equal(unauthorizedDraftResponse.status, 403, await unauthorizedDraftResponse.text());
    assert.equal(await mongoClient.db(dbName).collection('agreements').countDocuments(), unauthorizedDraftCountBefore);

    const blankTemplateIdCountBefore = await mongoClient.db(dbName).collection('agreements').countDocuments();
    const blankTemplateIdResponse = await fetch(`http://localhost:${port}/agreements-api/agreements`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        templateId: ' ',
        displayName: 'Blank template id draft',
      }),
    });
    assert.equal(blankTemplateIdResponse.status, 400, await blankTemplateIdResponse.text());
    assert.equal(await mongoClient.db(dbName).collection('agreements').countDocuments(), blankTemplateIdCountBefore);

    const unknownTemplateIdCountBefore = await mongoClient.db(dbName).collection('agreements').countDocuments();
    const unknownTemplateIdResponse = await fetch(`http://localhost:${port}/agreements-api/agreements`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        templateId: 'did:template:not-real-v1',
        displayName: 'Unknown template id draft',
      }),
    });
    assert.equal(unknownTemplateIdResponse.status, 400, await unknownTemplateIdResponse.text());
    assert.equal(await mongoClient.db(dbName).collection('agreements').countDocuments(), unknownTemplateIdCountBefore);

    const valuesResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}/values`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ values: { effectiveDate: '2026-01-01T00:00:00.000Z' } }),
    });
    const valuesBody = await readJsonResponse(valuesResponse);
    assert.equal(valuesResponse.status, 200, JSON.stringify(valuesBody));
    assert.equal(valuesBody.variables.effectiveDate, '2026-01-01T00:00:00.000Z');

    const participantsResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}/participants`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        participants: [{
          variableKey: 'clientWalletAddress',
          firstName: 'Pat',
          lastName: 'Participant',
          email: 'Participant@Example.com',
          walletAddress: '0x2222222222222222222222222222222222222222',
        }],
      }),
    });
    const participantsBody = await readJsonResponse(participantsResponse);
    assert.equal(participantsResponse.status, 200, JSON.stringify(participantsBody));
    assert.deepEqual(participantsBody.participants, [{
      variableKey: 'clientWalletAddress',
      firstName: 'Pat',
      lastName: 'Participant',
      email: 'participant@example.com',
      walletAddress: '0x2222222222222222222222222222222222222222',
      status: 'accepted',
    }]);

    const participantToken = tokenFor({
      userId: 'nest-mongo-participant-user',
      email: 'participant@example.com',
      wallet: '0x3333333333333333333333333333333333333333',
    });
    const participantGetResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}`, {
      headers: { authorization: `Bearer ${participantToken}` },
    });
    const participantGetBody = await readJsonResponse(participantGetResponse);
    assert.equal(participantGetResponse.status, 200, JSON.stringify(participantGetBody));
    assert.equal(participantGetBody.id, draftBody.id);

    const removedParticipantsResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}/participants`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ participants: [] }),
    });
    const removedParticipantsBody = await readJsonResponse(removedParticipantsResponse);
    assert.equal(removedParticipantsResponse.status, 200, JSON.stringify(removedParticipantsBody));
    assert.deepEqual(removedParticipantsBody.participants, []);
    assert.equal(removedParticipantsBody.variables.clientWalletAddress, undefined);
    assert.ok(!removedParticipantsBody.contributors.includes('0x2222222222222222222222222222222222222222'));

    const removedParticipantGetResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}`, {
      headers: { authorization: `Bearer ${participantToken}` },
    });
    assert.equal(removedParticipantGetResponse.status, 403, await removedParticipantGetResponse.text());

    const restoredParticipantsResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}/participants`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        participants: [{
          variableKey: 'clientWalletAddress',
          firstName: 'Pat',
          lastName: 'Participant',
          email: 'Participant@Example.com',
          walletAddress: '0x2222222222222222222222222222222222222222',
        }],
      }),
    });
    assert.equal(restoredParticipantsResponse.status, 200, await restoredParticipantsResponse.text());

    const nonOwnerUpdateResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}/values`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${participantToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ values: { effectiveDate: '2027-01-01T00:00:00.000Z' } }),
    });
    assert.equal(nonOwnerUpdateResponse.status, 403, await nonOwnerUpdateResponse.text());

    const invalidParticipantResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}/participants`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ participants: [{ variableKey: 'clientWalletAddress', email: 'not-an-email' }] }),
    });
    assert.equal(invalidParticipantResponse.status, 400, await invalidParticipantResponse.text());

    const invalidObserversResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}/observers`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ observers: ['bad-observer'] }),
    });
    assert.equal(invalidObserversResponse.status, 400, await invalidObserversResponse.text());

    const observersResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}/observers`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ observers: ['observer@example.com'] }),
    });
    const observersBody = await readJsonResponse(observersResponse);
    assert.equal(observersResponse.status, 200, JSON.stringify(observersBody));
    assert.deepEqual(observersBody.observers, ['observer@example.com']);

    const observerToken = tokenFor({
      userId: 'nest-mongo-observer-user',
      email: 'observer@example.com',
      wallet: '0x4444444444444444444444444444444444444444',
    });
    const observerGetResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}`, {
      headers: { authorization: `Bearer ${observerToken}` },
    });
    const observerGetBody = await readJsonResponse(observerGetResponse);
    assert.equal(observerGetResponse.status, 200, JSON.stringify(observerGetBody));
    assert.equal(observerGetBody.id, draftBody.id);

    const listResponse = await fetch(`http://localhost:${port}/agreements-api/agreements?status=Draft`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const listBody = await readJsonResponse(listResponse);
    assert.equal(listResponse.status, 200, JSON.stringify(listBody));
    assert.ok(listBody.some((agreement) => agreement.id === draftBody.id));

    const deployResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}/deploy-with-permit`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        signer: '0x1111111111111111111111111111111111111111',
        deadline: Math.floor(Date.now() / 1000) + 3600,
        signature: { v: 27, r: `0x${'1'.repeat(64)}`, s: `0x${'2'.repeat(64)}` },
      }),
    });
    const deployBody = await readJsonResponse(deployResponse);
    assert.equal(deployResponse.status, 201, JSON.stringify(deployBody));
    assert.equal(deployBody.status, 'Deployed');
    assert.match(deployBody.address, /^0x[0-9a-f]{40}$/);

    const inputResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}/input`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inputId: 'nestSmokeInput',
        values: { note: 'hello' },
        signer: '0x1111111111111111111111111111111111111111',
        deadline: Math.floor(Date.now() / 1000) + 3600,
        signature: { v: 27, r: `0x${'3'.repeat(64)}`, s: `0x${'4'.repeat(64)}` },
      }),
    });
    const inputBody = await readJsonResponse(inputResponse);
    assert.equal(inputResponse.status, 201, JSON.stringify(inputBody));
    assert.equal(inputBody.status, 'MINED');

    const stateResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}/state`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const stateBody = await readJsonResponse(stateResponse);
    assert.equal(stateResponse.status, 200, JSON.stringify(stateBody));
    assert.equal(stateBody.status, 'Deployed');

    const inputsResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}/inputs`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const inputsBody = await readJsonResponse(inputsResponse);
    assert.equal(inputsResponse.status, 200, JSON.stringify(inputsBody));
    assert.ok(inputsBody.some((input) => input.inputId === 'nestSmokeInput'));

    const deployedDeleteResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${draftBody.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(deployedDeleteResponse.status, 409, await deployedDeleteResponse.text());

    const deletableDraftResponse = await fetch(`http://localhost:${port}/agreements-api/agreements`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ templateId: 'did:template:mou-v1', displayName: 'Draft to delete' }),
    });
    const deletableDraftBody = await readJsonResponse(deletableDraftResponse);
    assert.equal(deletableDraftResponse.status, 201, JSON.stringify(deletableDraftBody));

    const nonOwnerDeleteResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${deletableDraftBody.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${participantToken}` },
    });
    assert.equal(nonOwnerDeleteResponse.status, 403, await nonOwnerDeleteResponse.text());

    const deleteResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${deletableDraftBody.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    const deleteBody = await readJsonResponse(deleteResponse);
    assert.equal(deleteResponse.status, 200, JSON.stringify(deleteBody));
    assert.deepEqual(deleteBody, { ok: true });

    const deletedGetResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${deletableDraftBody.id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(deletedGetResponse.status, 404, await deletedGetResponse.text());

    const persisted = await mongoClient.db(dbName).collection('template_access').findOne(
      { kind: 'global-default' },
      { projection: { _id: 0 } },
    );
    assert.deepEqual(persisted, {
      kind: 'global-default',
      templateIds: ['did:template:mou-v1'],
    });
    const platformUsers = await mongoClient.db(dbName).collection('platform_users').find({}, { projection: { _id: 0, id: 1 } }).toArray();
    const platformUserIds = new Set(platformUsers.map((user) => user.id));
    assert.equal(platformUsers.length, 3);

    const dynamicIdentities = await mongoClient.db(dbName).collection('user_identities')
      .find({ provider: 'dynamic' }, { projection: { _id: 0, provider: 1, subject: 1, userId: 1 } })
      .toArray();
    const expectedDynamicSubjects = [
      'dynamic:nest-mongo-smoke-user',
      'dynamic:nest-mongo-participant-user',
      'dynamic:nest-mongo-observer-user',
    ];
    assert.deepEqual(dynamicIdentities.map((identity) => identity.subject).sort(), expectedDynamicSubjects.sort());
    assert.equal(new Set(dynamicIdentities.map((identity) => identity.subject)).size, dynamicIdentities.length);
    assert.ok(dynamicIdentities.every((identity) => platformUserIds.has(identity.userId)));
    assert.equal(await mongoClient.db(dbName).collection('user_contacts').countDocuments(), 3);
    const userWallets = await mongoClient.db(dbName).collection('user_wallets')
      .find({}, { projection: { _id: 0, address: 1, userId: 1 } })
      .toArray();
    const expectedAuthenticatedWallets = [
      '0x1111111111111111111111111111111111111111',
      '0x3333333333333333333333333333333333333333',
      '0x4444444444444444444444444444444444444444',
    ];
    const walletAddresses = userWallets.map((wallet) => wallet.address).filter(Boolean);
    for (const address of expectedAuthenticatedWallets) {
      assert.ok(walletAddresses.includes(address), `missing wallet ${address}`);
    }
    assert.equal(new Set(walletAddresses).size, walletAddresses.length);
    assert.ok(userWallets.every((wallet) => platformUserIds.has(wallet.userId)));
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit').catch(() => undefined);
    await mongoClient.db(dbName).dropDatabase();
    await mongoClient.close();
  }
});

test('Reference app external bridge uses the real API client surface and mirrors/audits deployed execution', async (t) => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 1000 });
  try {
    await mongoClient.connect();
  } catch {
    t.skip('MongoDB is not available on MONGO_URI');
    return;
  }

  const externalCalls = [];
  let submittedInput = null;
  let inputSubmissionCount = 0;
  let listInputsCalls = 0;
  let failNextStateRead = false;
  const externalServer = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    externalCalls.push({
      method: req.method,
      url: req.url,
      apiKey: req.headers['x-api-key'],
      body,
    });

    if (body?.metadata?.templateId === 'fail-template') {
      writeJson(res, 400, errorEnvelope('bad_request', 'template rejected by external API', 'req_fake_fail'));
      return;
    }

    if (req.method === 'POST' && req.url === '/v0/agreements/validate-template') {
      writeJson(res, 201, successEnvelope({
        templateId: body?.metadata?.templateId || null,
        participantVariableKeys: ['clientWalletAddress'],
        inputIds: ['submitInvoice'],
        stateIds: ['AWAITING_INPUT', 'COMPLETE'],
        warnings: [],
      }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v0/agreements/validate') {
      writeJson(res, 201, successEnvelope({
        templateId: body?.agreement?.metadata?.templateId || null,
        participantVariableKeys: ['clientWalletAddress'],
        participants: body?.participants || [],
        observers: body?.observers || [],
        variables: {
          ...(body?.initValues || {}),
          clientWalletAddress: body?.participants?.[0]?.walletAddress,
        },
        contributors: [body?.participants?.[0]?.walletAddress].filter(Boolean),
        warnings: [],
      }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v0/agreements/deploy-with-permit') {
      writeJson(res, 201, successEnvelope({
        id: 'external-agreement-1',
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        chainId: body?.chainId,
        status: 'Deployed',
        state: 'AWAITING_INPUT',
        variables: {
          ...(body?.initValues || {}),
          clientWalletAddress: body?.participants?.[0]?.walletAddress,
        },
        participants: body?.participants || [],
        observers: body?.observers || [],
        onChain: { owner: body?.signer, source: 'fake-real-api' },
        displayName: body?.displayName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      return;
    }

    if (req.method === 'GET' && req.url === '/v0/agreements/external-agreement-1/state') {
      if (failNextStateRead) {
        failNextStateRead = false;
        writeJson(res, 503, errorEnvelope('service_unavailable', 'state read temporarily unavailable', 'req_state_fail'));
        return;
      }
      writeJson(res, 200, successEnvelope({ status: 'Deployed', state: submittedInput ? 'COMPLETE' : 'AWAITING_INPUT' }));
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/v0/agreements/external-agreement-1/inputs?')) {
      listInputsCalls += 1;
      const url = new URL(req.url, 'http://external-api.example.test');
      const cursor = url.searchParams.get('cursor');
      if (url.searchParams.get('userId') !== 'platform-user-bridge') {
        writeJson(res, 400, errorEnvelope('bad_request', 'unexpected userId'));
        return;
      }
      if (!submittedInput) {
        writeJson(res, 200, listEnvelope([]));
        return;
      }
      if (!cursor) {
        writeJson(res, 200, listEnvelope(
          [{ ...submittedInput, _id: `external-input-doc-${listInputsCalls}` }],
          'req_bridge_inputs_1',
          { nextCursor: 'bridge-cursor-2' },
        ));
        return;
      }
      if (cursor === 'bridge-cursor-2') {
        writeJson(res, 200, listEnvelope([{
          ...submittedInput,
          _id: `external-input-doc-follow-up-${listInputsCalls}`,
          inputId: 'confirmPayment',
          txHash: `0x${'7'.repeat(64)}`,
          values: { paymentConfirmed: 'yes' },
          createdAt: '2026-06-02T19:00:00.000Z',
          updatedAt: '2026-06-02T19:00:00.000Z',
        }]));
        return;
      }
      writeJson(res, 400, errorEnvelope('bad_request', `unexpected cursor ${cursor}`));
      return;
    }

    if (req.method === 'POST' && req.url === '/v0/agreements/external-agreement-1/input') {
      inputSubmissionCount += 1;
      submittedInput = {
        _id: `external-input-doc-submit-${inputSubmissionCount}`,
        agreementAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        chainId: 59141,
        inputId: body?.inputId,
        userId: 'platform-user-bridge',
        txHash: `0x${String(inputSubmissionCount).repeat(64)}`,
        payload: '0x',
        values: body?.values || {},
        status: 'MINED',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      writeJson(res, 201, successEnvelope(submittedInput));
      return;
    }

    writeJson(res, 404, { statusCode: 404, message: `No fake external route for ${req.method} ${req.url}` });
  });
  await new Promise((resolve) => externalServer.listen(0, '127.0.0.1', resolve));
  const externalPort = externalServer.address().port;

  const port = 4990 + Math.floor(Math.random() * 200);
  const dbName = `standalone_agreements_external_bridge_${process.pid}_${port}`;
  const child = spawn('pnpm', ['--filter', 'shodai-reference-backend', 'start'], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      AGREEMENTS_BACKEND_PORT: String(port),
      MONGO_URI: mongoUri,
      MONGO_DB_NAME: dbName,
      SERVICE_AUTH_TOKEN: serviceToken,
      EXTERNAL_API_BASE_URL: `http://127.0.0.1:${externalPort}`,
      EXTERNAL_API_KEY: 'bridge-external-key',
      SHODAI_WEBHOOK_SECRET: 'whsec_bridge',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  try {
    await waitForHealth(port, child, () => logs);

    const owner = '0x1111111111111111111111111111111111111111';
    const participant = '0x2222222222222222222222222222222222222222';
    const token = tokenFor({
      userId: 'bridge-user',
      email: 'bridge@example.com',
      wallet: owner,
    });
    const signinResponse = await fetch(`http://localhost:${port}/auth-api/auth/signin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, freshAuth: true }),
    });
    const signinBody = await readJsonResponse(signinResponse);
    assert.equal(signinResponse.status, 200, JSON.stringify(signinBody));

    const agreementJson = {
      metadata: { templateId: 'did:template:bridge-v1' },
      variables: {
        clientWalletAddress: { type: 'address', subtype: 'participant' },
      },
      execution: {
        initialState: 'AWAITING_INPUT',
        inputs: { submitInvoice: {} },
        states: { AWAITING_INPUT: {}, COMPLETE: {} },
      },
    };

    const unauthenticatedValidateTemplateResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/direct/validate-template`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(agreementJson),
    });
    assert.equal(unauthenticatedValidateTemplateResponse.status, 401, await unauthenticatedValidateTemplateResponse.text());
    assert.equal(externalCalls.length, 0);

    const unauthenticatedValidateDeploymentResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/direct/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agreement: agreementJson,
        chainId: 59141,
        initValues: { invoiceTotal: '1000' },
        participants: [{ variableKey: 'clientWalletAddress', walletAddress: participant, email: 'client@example.com' }],
        observers: ['observer@example.com'],
      }),
    });
    assert.equal(unauthenticatedValidateDeploymentResponse.status, 401, await unauthenticatedValidateDeploymentResponse.text());
    assert.equal(externalCalls.length, 0);

    const validateTemplateResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/direct/validate-template`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(agreementJson),
    });
    const validateTemplateBody = await readJsonResponse(validateTemplateResponse);
    assert.equal(validateTemplateResponse.status, 201, JSON.stringify(validateTemplateBody));
    assert.deepEqual(validateTemplateBody.inputIds, ['submitInvoice']);

    const validateDeploymentResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/direct/validate`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        agreement: agreementJson,
        chainId: 59141,
        initValues: { invoiceTotal: '1000' },
        participants: [{ variableKey: 'clientWalletAddress', walletAddress: participant, email: 'client@example.com' }],
        observers: ['observer@example.com'],
      }),
    });
    const validateDeploymentBody = await readJsonResponse(validateDeploymentResponse);
    assert.equal(validateDeploymentResponse.status, 201, JSON.stringify(validateDeploymentBody));
    assert.equal(validateDeploymentBody.variables.clientWalletAddress, participant);

    const now = new Date().toISOString();
    await mongoClient.db(dbName).collection('agreements').insertOne({
      id: 'bridge-draft-1',
      status: 'Draft',
      chainId: 59141,
      displayName: 'Bridge Draft',
      owner,
      contributors: [owner],
      json: agreementJson,
      variables: { invoiceTotal: '1000', clientWalletAddress: participant },
      participants: [{ variableKey: 'clientWalletAddress', walletAddress: participant, email: 'client@example.com', status: 'accepted' }],
      observers: ['observer@example.com'],
      createdAt: now,
      updatedAt: now,
    });
    const deployResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/bridge-draft-1/deploy-with-permit`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        signer: owner,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        signature: { v: 27, r: `0x${'1'.repeat(64)}`, s: `0x${'2'.repeat(64)}` },
        docUri: 'ipfs://agreement/signed-doc-uri',
        initValues: { invoiceTotal: '2000', signedOnly: 'yes' },
      }),
    });
    const deployBody = await readJsonResponse(deployResponse);
    assert.equal(deployResponse.status, 201, JSON.stringify(deployBody));
    assert.equal(deployBody.externalAgreementId, 'external-agreement-1');
    assert.equal(deployBody.address, '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(deployBody.chainId, 59141);
    assert.equal(deployBody.onChainRef, 'eip155:59141:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(deployBody.docUri, 'ipfs://agreement/signed-doc-uri');
    assert.equal(deployBody.state, 'AWAITING_INPUT');
    assert.equal(deployBody.variables.clientWalletAddress, participant);
    assert.equal(deployBody.variables.invoiceTotal, '2000');
    assert.equal(deployBody.variables.signedOnly, 'yes');

    const stateResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/bridge-draft-1/state`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const stateBody = await readJsonResponse(stateResponse);
    assert.equal(stateResponse.status, 200, JSON.stringify(stateBody));
    assert.equal(stateBody.state, 'AWAITING_INPUT');

    const submitResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${deployBody.address}/input`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inputId: 'submitInvoice',
        values: { invoiceNumber: 'INV-1' },
        signer: owner,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        signature: { v: 27, r: `0x${'3'.repeat(64)}`, s: `0x${'4'.repeat(64)}` },
      }),
    });
    const submitBody = await readJsonResponse(submitResponse);
    assert.equal(submitResponse.status, 201, JSON.stringify(submitBody));
    assert.equal(submitBody.status, 'MINED');

    const inputsResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${deployBody.address}/inputs?userId=platform-user-bridge`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const inputsBody = await readJsonResponse(inputsResponse);
    assert.equal(inputsResponse.status, 200, JSON.stringify(inputsBody));
    assert.deepEqual(inputsBody.map((entry) => entry.inputId), ['submitInvoice', 'confirmPayment']);

    const repeatedInputsResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${deployBody.address}/inputs?userId=platform-user-bridge`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const repeatedInputsBody = await readJsonResponse(repeatedInputsResponse);
    assert.equal(repeatedInputsResponse.status, 200, JSON.stringify(repeatedInputsBody));
    assert.deepEqual(repeatedInputsBody.map((entry) => entry.inputId), ['submitInvoice', 'confirmPayment']);

    const mirroredAgreement = await mongoClient.db(dbName).collection('agreements').findOne(
      { id: 'bridge-draft-1' },
      { projection: { _id: 0 } },
    );
    assert.equal(mirroredAgreement.state, 'COMPLETE');
    assert.equal(mirroredAgreement.lastInputId, 'submitInvoice');
    assert.equal(mirroredAgreement.variables.invoiceNumber, 'INV-1');
    assert.equal(await mongoClient.db(dbName).collection('agreement_inputs').countDocuments({ inputId: 'submitInvoice' }), 1);
    assert.equal(await mongoClient.db(dbName).collection('agreement_inputs').countDocuments({ inputId: 'confirmPayment' }), 1);

    failNextStateRead = true;
    const stateFailureSubmitResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${deployBody.address}/input`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        inputId: 'submitInvoiceAfterStateFailure',
        values: { invoiceNumber: 'INV-STATE-FAIL' },
        signer: owner,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        signature: { v: 27, r: `0x${'8'.repeat(64)}`, s: `0x${'9'.repeat(64)}` },
      }),
    });
    const stateFailureSubmitBody = await readJsonResponse(stateFailureSubmitResponse);
    assert.equal(stateFailureSubmitResponse.status, 201, `${JSON.stringify(stateFailureSubmitBody)}\n${logs}`);
    assert.equal(stateFailureSubmitBody.status, 'MINED');
    assert.equal(
      await mongoClient.db(dbName).collection('agreement_inputs').countDocuments({ inputId: 'submitInvoiceAfterStateFailure' }),
      1,
    );

    const failingValidateResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/direct/validate-template`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ metadata: { templateId: 'fail-template' } }),
    });
    const failingValidateBody = await readJsonResponse(failingValidateResponse);
    assert.equal(failingValidateResponse.status, 400, JSON.stringify(failingValidateBody));
    assert.equal(failingValidateBody.message, 'template rejected by external API');

    assert.deepEqual(externalCalls.map((call) => [call.method, call.url]), [
      ['POST', '/v0/agreements/validate-template'],
      ['POST', '/v0/agreements/validate'],
      ['POST', '/v0/agreements/validate'],
      ['POST', '/v0/agreements/deploy-with-permit'],
      ['GET', '/v0/agreements/external-agreement-1/state'],
      ['POST', '/v0/agreements/external-agreement-1/input'],
      ['GET', '/v0/agreements/external-agreement-1/state'],
      ['GET', '/v0/agreements/external-agreement-1/inputs?userId=platform-user-bridge'],
      ['GET', '/v0/agreements/external-agreement-1/inputs?userId=platform-user-bridge&cursor=bridge-cursor-2'],
      ['GET', '/v0/agreements/external-agreement-1/inputs?userId=platform-user-bridge'],
      ['GET', '/v0/agreements/external-agreement-1/inputs?userId=platform-user-bridge&cursor=bridge-cursor-2'],
      ['POST', '/v0/agreements/external-agreement-1/input'],
      ['GET', '/v0/agreements/external-agreement-1/state'],
      ['POST', '/v0/agreements/validate-template'],
    ]);
    assert.equal(
      externalCalls.find((call) => call.url === '/v0/agreements/deploy-with-permit')?.body?.docUri,
      'ipfs://agreement/signed-doc-uri',
    );
    assert.equal(
      externalCalls.find((call) => call.url === '/v0/agreements/deploy-with-permit')?.body?.chainId,
      59141,
    );
    assert.deepEqual(
      externalCalls.find((call) => call.url === '/v0/agreements/deploy-with-permit')?.body?.initValues,
      {
        invoiceTotal: '2000',
        clientWalletAddress: participant,
        signedOnly: 'yes',
      },
    );
    assert.ok(
      externalCalls
        .filter((call) => call.url === '/v0/agreements/validate')
        .every((call) => call.body?.chainId === 59141),
    );
    assert.ok(externalCalls.every((call) => call.apiKey === 'bridge-external-key'));

    const auditEvents = await mongoClient.db(dbName).collection('external_api_events').find(
      {},
      { projection: { _id: 0, operation: 1, ok: 1, error: 1, path: 1, mock: 1, agreementId: 1, externalAgreementId: 1, inputCount: 1, pageCount: 1 } },
    ).sort({ createdAt: 1 }).toArray();
    assert.equal(auditEvents.filter((event) => event.ok === true).length, 10);
    assert.equal(auditEvents.filter((event) => event.error === 'template rejected by external API').length, 1);
    assert.ok(auditEvents.some((event) =>
      event.operation === 'read-state-after-input' &&
      event.agreementId === 'bridge-draft-1' &&
      event.error
    ));
    assert.ok(auditEvents.every((event) => event.mock === false));
    assert.ok(auditEvents.every((event) => !JSON.stringify(event).includes('bridge-external-key')));
    assert.ok(auditEvents.some((event) =>
      event.operation === 'deploy-with-permit' &&
      event.agreementId === 'bridge-draft-1'
    ));
    assert.ok(auditEvents.some((event) =>
      event.operation === 'submit-input' &&
      event.agreementId === 'bridge-draft-1' &&
      event.externalAgreementId === 'external-agreement-1'
    ));
    const listInputAuditEvents = auditEvents.filter((event) => event.operation === 'list-inputs');
    assert.equal(listInputAuditEvents.length, 2);
    assert.ok(listInputAuditEvents.every((event) => event.inputCount === 2 && event.pageCount === 2));
    assert.ok(!logs.includes('MongoServerError'), logs);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit').catch(() => undefined);
    await mongoClient.db(dbName).dropDatabase();
    await mongoClient.close();
    await new Promise((resolve) => externalServer.close(resolve));
  }
});

test('Reference app scopes deployed agreement lookup and input mirrors by chain', async (t) => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 1000 });
  try {
    await mongoClient.connect();
  } catch {
    t.skip('MongoDB is not available on MONGO_URI');
    return;
  }

  const sharedAddress = '0xabababababababababababababababababababab';
  const sharedTxHash = `0x${'c'.repeat(64)}`;
  const externalInputsByAgreement = {
    'external-scope-linea': [{
      agreementAddress: sharedAddress,
      chainId: 59141,
      inputId: 'lineaInput',
      userId: 'platform-user-scope',
      txHash: sharedTxHash,
      payload: '0x',
      values: { chain: 'linea' },
      status: 'MINED',
      createdAt: '2026-06-04T10:00:00.000Z',
      updatedAt: '2026-06-04T10:00:00.000Z',
    }],
    'external-scope-base': [{
      agreementAddress: sharedAddress,
      chainId: 84532,
      inputId: 'baseInput',
      userId: 'platform-user-scope',
      txHash: sharedTxHash,
      payload: '0x',
      values: { chain: 'base' },
      status: 'MINED',
      createdAt: '2026-06-04T10:01:00.000Z',
      updatedAt: '2026-06-04T10:01:00.000Z',
    }],
  };
  const externalStatesByAgreement = {
    'external-scope-linea': 'LINEA_READY',
    'external-scope-base': 'BASE_READY',
  };
  const externalServer = createServer(async (req, res) => {
    const stateMatch = req.url?.match(/^\/v0\/agreements\/([^/?]+)\/state$/);
    if (req.method === 'GET' && stateMatch) {
      const externalAgreementId = decodeURIComponent(stateMatch[1]);
      writeJson(res, 200, successEnvelope({
        status: 'Deployed',
        state: externalStatesByAgreement[externalAgreementId] || 'UNKNOWN',
      }));
      return;
    }

    const inputsMatch = req.url?.match(/^\/v0\/agreements\/([^/?]+)\/inputs(?:\?.*)?$/);
    if (req.method === 'GET' && inputsMatch) {
      const externalAgreementId = decodeURIComponent(inputsMatch[1]);
      writeJson(res, 200, listEnvelope(externalInputsByAgreement[externalAgreementId] || []));
      return;
    }

    writeJson(res, 404, { statusCode: 404, message: `No fake external route for ${req.method} ${req.url}` });
  });
  await new Promise((resolve) => externalServer.listen(0, '127.0.0.1', resolve));
  const externalPort = externalServer.address().port;

  const port = 5090 + Math.floor(Math.random() * 200);
  const dbName = `standalone_agreements_scoped_lookup_${process.pid}_${port}`;
  const child = spawn('pnpm', ['--filter', 'shodai-reference-backend', 'start'], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      AGREEMENTS_BACKEND_PORT: String(port),
      MONGO_URI: mongoUri,
      MONGO_DB_NAME: dbName,
      SERVICE_AUTH_TOKEN: serviceToken,
      EXTERNAL_API_BASE_URL: `http://127.0.0.1:${externalPort}`,
      EXTERNAL_API_KEY: 'scoped-lookup-external-key',
      SHODAI_WEBHOOK_SECRET: 'whsec_scoped_lookup',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  try {
    await waitForHealth(port, child, () => logs);
    const db = mongoClient.db(dbName);
    const owner = '0x1111111111111111111111111111111111111111';
    const token = tokenFor({
      userId: 'scope-user',
      email: 'scope@example.com',
      wallet: owner,
    });
    const now = new Date().toISOString();
    await db.collection('agreements').insertMany([
      {
        id: 'local-linea-agreement',
        externalAgreementId: 'external-scope-linea',
        address: sharedAddress,
        onChainRef: `eip155:59141:${sharedAddress}`,
        status: 'Deployed',
        chainId: 59141,
        displayName: 'Linea scoped agreement',
        owner,
        contributors: [owner],
        json: { metadata: { templateId: 'did:template:scope-v1' }, execution: { initialState: 'LINEA_READY' } },
        variables: {},
        participants: [],
        observers: [],
        state: 'LOCAL_LINEA',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'local-base-agreement',
        externalAgreementId: 'external-scope-base',
        address: sharedAddress,
        onChainRef: `eip155:84532:${sharedAddress}`,
        status: 'Deployed',
        chainId: 84532,
        displayName: 'Base scoped agreement',
        owner,
        contributors: [owner],
        json: { metadata: { templateId: 'did:template:scope-v1' }, execution: { initialState: 'BASE_READY' } },
        variables: {},
        participants: [],
        observers: [],
        state: 'LOCAL_BASE',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const ambiguousStateResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${sharedAddress}/state`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const ambiguousStateBody = await readJsonResponse(ambiguousStateResponse);
    assert.equal(ambiguousStateResponse.status, 400, JSON.stringify(ambiguousStateBody));
    assert.match(ambiguousStateBody.message, /matches multiple chains/);

    const rawScopedStateResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${sharedAddress}/state?chainId=84532`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const rawScopedStateBody = await readJsonResponse(rawScopedStateResponse);
    assert.equal(rawScopedStateResponse.status, 200, JSON.stringify(rawScopedStateBody));
    assert.equal(rawScopedStateBody.state, 'BASE_READY');

    const caipInputsResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/${encodeURIComponent(`eip155:59141:${sharedAddress}`)}/inputs?userId=platform-user-scope`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const caipInputsBody = await readJsonResponse(caipInputsResponse);
    assert.equal(caipInputsResponse.status, 200, JSON.stringify(caipInputsBody));
    assert.deepEqual(caipInputsBody.map((entry) => [entry.inputId, entry.chainId]), [['lineaInput', 59141]]);

    const localInputsResponse = await fetch(`http://localhost:${port}/agreements-api/agreements/local-base-agreement/inputs?userId=platform-user-scope`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const localInputsBody = await readJsonResponse(localInputsResponse);
    assert.equal(localInputsResponse.status, 200, JSON.stringify(localInputsBody));
    assert.deepEqual(localInputsBody.map((entry) => [entry.inputId, entry.chainId]), [['baseInput', 84532]]);

    const mirroredInputs = await db.collection('agreement_inputs').find(
      { txHash: sharedTxHash },
      { projection: { _id: 0, agreementId: 1, chainId: 1, agreementAddress: 1, txHash: 1, inputId: 1 } },
    ).sort({ chainId: 1 }).toArray();
    assert.deepEqual(mirroredInputs, [
      {
        agreementId: 'local-linea-agreement',
        agreementAddress: sharedAddress,
        chainId: 59141,
        inputId: 'lineaInput',
        txHash: sharedTxHash,
      },
      {
        agreementId: 'local-base-agreement',
        agreementAddress: sharedAddress,
        chainId: 84532,
        inputId: 'baseInput',
        txHash: sharedTxHash,
      },
    ]);
    assert.ok(!logs.includes('MongoServerError'), logs);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit').catch(() => undefined);
    await mongoClient.db(dbName).dropDatabase();
    await mongoClient.close();
    await new Promise((resolve) => externalServer.close(resolve));
  }
});

test('Webhook receiver verifies deliveries, retries recoverable events, and reconciles full input history', async (t) => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
  const mongoClient = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 1000 });
  try {
    await mongoClient.connect();
  } catch {
    t.skip('MongoDB is not available on MONGO_URI');
    return;
  }

  const webhookSecret = 'whsec_webhook_receiver_test';
  const externalCalls = [];
  let failedAgreementReadAttempts = 0;
  const externalRecords = {
    'external-agreement-webhook-1': {
      id: 'external-agreement-webhook-1',
      address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      state: 'ACCEPTED',
      displayName: 'Webhook Reconciled Agreement',
      variables: { scope: 'Validate webhook reconciliation' },
      observers: ['observer@example.com'],
      onChain: { source: 'fake-webhook-api' },
    },
    'external-agreement-deploy-1': {
      id: 'external-agreement-deploy-1',
      address: '0xbabababababababababababababababababababa',
      state: 'PENDING_ACCEPTANCE',
      displayName: 'Webhook Deploy Agreement',
      variables: { scope: 'Deploy transition reconciliation' },
      observers: ['deploy-observer@example.com'],
      onChain: { source: 'fake-deploy-api' },
    },
    'external-agreement-race-1': {
      id: 'external-agreement-race-1',
      address: '0xcccccccccccccccccccccccccccccccccccccccc',
      state: 'ACCEPTED',
      displayName: 'Webhook Race Agreement',
      variables: { scope: 'Race retry reconciliation' },
      observers: ['race-observer@example.com'],
      onChain: { source: 'fake-race-api' },
    },
    'external-agreement-fail-1': {
      id: 'external-agreement-fail-1',
      address: '0xdddddddddddddddddddddddddddddddddddddddd',
      state: 'ACCEPTED',
      displayName: 'Webhook Failed Retry Agreement',
      variables: { scope: 'Failed retry reconciliation' },
      observers: ['fail-observer@example.com'],
      onChain: { source: 'fake-fail-api' },
    },
    'external-agreement-dead-1': {
      id: 'external-agreement-dead-1',
      address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      state: 'ACCEPTED',
      displayName: 'Webhook Dead Letter Agreement',
      variables: { scope: 'Dead letter reconciliation' },
      observers: ['dead-observer@example.com'],
      onChain: { source: 'fake-dead-api' },
    },
  };
  const externalInputsByAgreement = {
    'external-agreement-webhook-1': [
      {
        _id: 'external-input-doc-webhook-party-b',
        agreementAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        chainId: 59141,
        inputId: 'partyBSignature',
        userId: 'platform-user-webhook',
        txHash: `0x${'6'.repeat(64)}`,
        payload: '0x',
        values: { partyBSignature: 'Webhook reconciled party B signature' },
        status: 'MINED',
        createdAt: '2026-06-02T18:01:00.000Z',
        updatedAt: '2026-06-02T18:01:00.000Z',
      },
      {
        _id: 'external-input-doc-webhook-final',
        agreementAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        chainId: 59141,
        inputId: 'acceptFinal',
        userId: 'platform-user-webhook',
        txHash: `0x${'8'.repeat(64)}`,
        payload: '0x',
        values: { finalSignature: 'Webhook reconciled final signature' },
        status: 'MINED',
        createdAt: '2026-06-02T18:02:00.000Z',
        updatedAt: '2026-06-02T18:02:00.000Z',
      },
    ],
    'external-agreement-race-1': [{
      _id: 'external-input-doc-race',
      agreementAddress: '0xcccccccccccccccccccccccccccccccccccccccc',
      chainId: 59141,
      inputId: 'raceAccept',
      userId: 'platform-user-race',
      txHash: `0x${'9'.repeat(64)}`,
      payload: '0x',
      values: { raceAccepted: true },
      status: 'MINED',
      createdAt: '2026-06-02T18:03:00.000Z',
      updatedAt: '2026-06-02T18:03:00.000Z',
    }],
    'external-agreement-fail-1': [{
      _id: 'external-input-doc-fail',
      agreementAddress: '0xdddddddddddddddddddddddddddddddddddddddd',
      chainId: 59141,
      inputId: 'failAccept',
      userId: 'platform-user-fail',
      txHash: `0x${'a'.repeat(64)}`,
      payload: '0x',
      values: { failRecovered: true },
      status: 'MINED',
      createdAt: '2026-06-02T18:04:00.000Z',
      updatedAt: '2026-06-02T18:04:00.000Z',
    }],
    'external-agreement-dead-1': [{
      _id: 'external-input-doc-dead',
      agreementAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      chainId: 59141,
      inputId: 'deadAccept',
      userId: 'platform-user-dead',
      txHash: `0x${'b'.repeat(64)}`,
      payload: '0x',
      values: { deadRecovered: true },
      status: 'MINED',
      createdAt: '2026-06-02T18:05:00.000Z',
      updatedAt: '2026-06-02T18:05:00.000Z',
    }],
  };
  const externalServer = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    externalCalls.push({
      method: req.method,
      url: req.url,
      apiKey: req.headers['x-api-key'],
    });

    const agreementMatch = req.url?.match(/^\/v0\/agreements\/([^/?]+)$/);
    if (req.method === 'GET' && agreementMatch) {
      const externalAgreementId = decodeURIComponent(agreementMatch[1]);
      if (externalAgreementId === 'external-agreement-fail-1' && failedAgreementReadAttempts === 0) {
        failedAgreementReadAttempts += 1;
        writeJson(res, 503, errorEnvelope('temporary_failure', 'temporary external outage'));
        return;
      }
      if (externalAgreementId === 'external-agreement-dead-1') {
        writeJson(res, 503, errorEnvelope('permanent_test_failure', 'persistent external outage'));
        return;
      }
      const record = externalRecords[externalAgreementId];
      if (!record) {
        writeJson(res, 404, { statusCode: 404, message: `No fake external agreement ${externalAgreementId}` });
        return;
      }
      writeJson(res, 200, successEnvelope({
        id: record.id,
        address: record.address,
        chainId: 59141,
        status: 'Deployed',
        state: record.state,
        variables: record.variables,
        participants: [{ variableKey: 'clientWalletAddress', walletAddress: '0x2222222222222222222222222222222222222222', email: 'client@example.com' }],
        observers: record.observers,
        onChain: record.onChain,
        displayName: record.displayName,
        createdAt: '2026-06-02T18:00:00.000Z',
        updatedAt: '2026-06-02T18:02:00.000Z',
      }));
      return;
    }

    const stateMatch = req.url?.match(/^\/v0\/agreements\/([^/?]+)\/state$/);
    if (req.method === 'GET' && stateMatch) {
      const externalAgreementId = decodeURIComponent(stateMatch[1]);
      const record = externalRecords[externalAgreementId];
      writeJson(res, 200, successEnvelope({ status: 'Deployed', state: record?.state || 'ACCEPTED' }));
      return;
    }

    const inputsMatch = req.url?.match(/^\/v0\/agreements\/([^/?]+)\/inputs(?:\?.*)?$/);
    if (req.method === 'GET' && inputsMatch) {
      const externalAgreementId = decodeURIComponent(inputsMatch[1]);
      const url = new URL(req.url, 'http://external-api.example.test');
      const cursor = url.searchParams.get('cursor');
      const inputs = externalInputsByAgreement[externalAgreementId] || [];
      const nextCursor = inputs.length > 1 ? `${externalAgreementId}-cursor-2` : null;
      if (!cursor) {
        writeJson(res, 200, listEnvelope(inputs.slice(0, 1), `req_inputs_${externalAgreementId}_1`, { nextCursor }));
        return;
      }
      if (cursor === nextCursor) {
        writeJson(res, 200, listEnvelope(inputs.slice(1), `req_inputs_${externalAgreementId}_2`));
        return;
      }
      writeJson(res, 400, errorEnvelope('bad_request', `unexpected cursor ${cursor}`));
      return;
    }

    writeJson(res, 404, { statusCode: 404, message: `No fake external route for ${req.method} ${req.url}` });
  });
  await new Promise((resolve) => externalServer.listen(0, '127.0.0.1', resolve));
  const externalPort = externalServer.address().port;

  const port = 5190 + Math.floor(Math.random() * 200);
  const dbName = `standalone_agreements_webhook_receiver_${process.pid}_${port}`;
  const child = spawn('pnpm', ['--filter', 'shodai-reference-backend', 'start'], {
    cwd: appRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      AGREEMENTS_BACKEND_PORT: String(port),
      MONGO_URI: mongoUri,
      MONGO_DB_NAME: dbName,
      SERVICE_AUTH_TOKEN: serviceToken,
      EXTERNAL_API_BASE_URL: `http://127.0.0.1:${externalPort}`,
      EXTERNAL_API_KEY: 'webhook-external-key',
      SHODAI_WEBHOOK_SECRET: webhookSecret,
      SHODAI_WEBHOOK_PROCESSOR_INTERVAL_MS: '50',
      SHODAI_WEBHOOK_PROCESSOR_MAX_ATTEMPTS: '2',
      SHODAI_WEBHOOK_PROCESSOR_RETRY_BASE_MS: '500',
      SHODAI_WEBHOOK_PROCESSOR_RETRY_MAX_MS: '500',
      SHODAI_WEBHOOK_PROCESSOR_LEASE_SECONDS: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  try {
    await waitForHealth(port, child, () => logs);
    const db = mongoClient.db(dbName);

    await insertWebhookAgreement(db, {
      id: 'webhook-local-1',
      externalAgreementId: 'external-agreement-webhook-1',
      address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      displayName: 'Webhook Local Agreement',
      variables: { scope: 'Before webhook' },
    });

    const acceptedEvent = transitionEvent({
      id: 'evt_webhook_reconcile_1',
      agreementId: 'external-agreement-webhook-1',
      agreementName: 'Webhook Reconciled Agreement',
      createdAt: '2026-06-02T18:02:00.000Z',
      fromState: 'PENDING_ACCEPTANCE',
      toState: 'ACCEPTED',
      inputId: 'acceptFinal',
    });
    const acceptedResponse = await sendWebhookEvent(port, acceptedEvent, webhookSecret);
    assert.equal(acceptedResponse.status, 204, await acceptedResponse.text());
    const queuedDuplicateResponse = await sendWebhookEvent(port, acceptedEvent, webhookSecret);
    assert.equal(queuedDuplicateResponse.status, 204, await queuedDuplicateResponse.text());

    const processedEvent = await waitForWebhookEvent(db, acceptedEvent.id, (event) => event.status === 'processed', {
      projection: { _id: 0, status: 1, processedAction: 1, reconciliation: 1, duplicateDeliveryCount: 1, attemptCount: 1 },
    });
    assert.deepEqual(processedEvent, {
      status: 'processed',
      processedAction: 'reconciled_agreement_mirror',
      duplicateDeliveryCount: 1,
      attemptCount: 1,
      reconciliation: {
        state: 'ACCEPTED',
        inputCount: 2,
        inputPageCount: 2,
        latestInputId: 'acceptFinal',
      },
    });

    const reconciledAgreement = await db.collection('agreements').findOne(
      { id: 'webhook-local-1' },
      { projection: { _id: 0 } },
    );
    assert.equal(reconciledAgreement.state, 'ACCEPTED');
    assert.equal(reconciledAgreement.lastWebhookEventId, acceptedEvent.id);
    assert.equal(reconciledAgreement.lastWebhookEventAt, acceptedEvent.createdAt);
    assert.equal(reconciledAgreement.lastInputId, 'acceptFinal');
    assert.equal(reconciledAgreement.lastInputAt, '2026-06-02T18:02:00.000Z');
    assert.equal(reconciledAgreement.variables.scope, 'Validate webhook reconciliation');
    assert.equal(reconciledAgreement.variables.partyBSignature, 'Webhook reconciled party B signature');
    assert.equal(reconciledAgreement.variables.finalSignature, 'Webhook reconciled final signature');
    assert.equal(reconciledAgreement.onChain.source, 'fake-webhook-api');
    assert.deepEqual(reconciledAgreement.observers, ['observer@example.com']);
    assert.equal(await db.collection('agreement_inputs').countDocuments({ agreementId: 'webhook-local-1' }), 2);
    assert.deepEqual(externalCalls.map((call) => [call.method, call.url]), [
      ['GET', '/v0/agreements/external-agreement-webhook-1'],
      ['GET', '/v0/agreements/external-agreement-webhook-1/state'],
      ['GET', '/v0/agreements/external-agreement-webhook-1/inputs'],
      ['GET', '/v0/agreements/external-agreement-webhook-1/inputs?cursor=external-agreement-webhook-1-cursor-2'],
    ]);
    assert.ok(externalCalls.every((call) => call.apiKey === 'webhook-external-key'));
    const callsAfterAccepted = externalCalls.length;

    const duplicateResponse = await sendWebhookEvent(port, acceptedEvent, webhookSecret);
    assert.equal(duplicateResponse.status, 204, await duplicateResponse.text());
    const duplicateEvent = await db.collection('webhook_events').findOne(
      { eventId: acceptedEvent.id },
      { projection: { _id: 0, status: 1, duplicateDeliveryCount: 1 } },
    );
    assert.deepEqual(duplicateEvent, {
      status: 'processed',
      duplicateDeliveryCount: 2,
    });
    assert.equal(externalCalls.length, callsAfterAccepted);

    const staleEvent = {
      ...acceptedEvent,
      id: 'evt_webhook_stale_1',
      createdAt: '2026-06-02T18:00:00.000Z',
      data: {
        ...acceptedEvent.data,
        fromState: 'PENDING_PARTY_B_SIGNATURE',
        toState: 'PENDING_ACCEPTANCE',
        inputId: 'partyBSignature',
      },
    };
    const staleResponse = await sendWebhookEvent(port, staleEvent, webhookSecret);
    assert.equal(staleResponse.status, 204, await staleResponse.text());
    const staleStoredEvent = await waitForWebhookEvent(db, staleEvent.id, (event) => event.status === 'ignored', {
      projection: { _id: 0, status: 1, ignoredReason: 1 },
    });
    assert.deepEqual(staleStoredEvent, {
      status: 'ignored',
      ignoredReason: 'stale_delivery',
    });
    const afterStaleAgreement = await db.collection('agreements').findOne(
      { id: 'webhook-local-1' },
      { projection: { _id: 0, state: 1, lastWebhookEventId: 1 } },
    );
    assert.deepEqual(afterStaleAgreement, {
      state: 'ACCEPTED',
      lastWebhookEventId: acceptedEvent.id,
    });
    assert.equal(externalCalls.length, callsAfterAccepted);
    const staleDuplicateResponse = await sendWebhookEvent(port, staleEvent, webhookSecret);
    assert.equal(staleDuplicateResponse.status, 204, await staleDuplicateResponse.text());
    const staleDuplicateEvent = await db.collection('webhook_events').findOne(
      { eventId: staleEvent.id },
      { projection: { _id: 0, status: 1, ignoredReason: 1, duplicateDeliveryCount: 1 } },
    );
    assert.deepEqual(staleDuplicateEvent, {
      status: 'ignored',
      ignoredReason: 'stale_delivery',
      duplicateDeliveryCount: 1,
    });
    assert.equal(externalCalls.length, callsAfterAccepted);

    await insertWebhookAgreement(db, {
      id: 'webhook-deploy-local-1',
      externalAgreementId: 'external-agreement-deploy-1',
      address: '0xbabababababababababababababababababababa',
      displayName: 'Webhook Deploy Local Agreement',
      variables: { scope: 'Before deploy webhook' },
    });
    const deployEvent = transitionEvent({
      id: 'evt_webhook_deploy_1',
      agreementId: 'external-agreement-deploy-1',
      agreementName: 'Webhook Deploy Agreement',
      createdAt: '2026-06-02T18:02:30.000Z',
      fromState: '',
      toState: 'PENDING_ACCEPTANCE',
      inputId: '__deploy',
    });
    const callsBeforeDeploy = externalCalls.length;
    const deployResponse = await sendWebhookEvent(port, deployEvent, webhookSecret);
    assert.equal(deployResponse.status, 204, await deployResponse.text());
    const deployStoredEvent = await waitForWebhookEvent(db, deployEvent.id, (event) => event.status === 'processed', {
      projection: { _id: 0, status: 1, processedAction: 1, reconciliation: 1, attemptCount: 1 },
    });
    assert.deepEqual(deployStoredEvent, {
      status: 'processed',
      processedAction: 'reconciled_agreement_mirror',
      attemptCount: 1,
      reconciliation: {
        state: 'PENDING_ACCEPTANCE',
        inputCount: 0,
        inputPageCount: 1,
        latestInputId: null,
      },
    });
    const deployAgreement = await db.collection('agreements').findOne(
      { id: 'webhook-deploy-local-1' },
      { projection: { _id: 0, state: 1, lastInputId: 1, lastInputAt: 1, lastWebhookEventId: 1 } },
    );
    assert.equal(deployAgreement.state, 'PENDING_ACCEPTANCE');
    assert.equal(deployAgreement.lastWebhookEventId, deployEvent.id);
    assert.equal(deployAgreement.lastInputId, undefined);
    assert.equal(deployAgreement.lastInputAt, undefined);
    assert.deepEqual(externalCalls.slice(callsBeforeDeploy).map((call) => [call.method, call.url]), [
      ['GET', '/v0/agreements/external-agreement-deploy-1'],
      ['GET', '/v0/agreements/external-agreement-deploy-1/state'],
      ['GET', '/v0/agreements/external-agreement-deploy-1/inputs'],
    ]);
    const callsAfterDeploy = externalCalls.length;

    const raceEvent = transitionEvent({
      id: 'evt_webhook_race_1',
      agreementId: 'external-agreement-race-1',
      agreementName: 'Webhook Race Agreement',
      createdAt: '2026-06-02T18:03:00.000Z',
      fromState: 'PENDING_ACCEPTANCE',
      toState: 'ACCEPTED',
      inputId: 'raceAccept',
    });
    const raceMissingResponse = await sendWebhookEvent(port, raceEvent, webhookSecret);
    assert.equal(raceMissingResponse.status, 204, await raceMissingResponse.text());
    const raceMissingEvent = await waitForWebhookEvent(db, raceEvent.id, (event) => event.status === 'retry_scheduled', {
      projection: { _id: 0, status: 1, retryReason: 1, attemptCount: 1, nextAttemptAt: 1 },
    });
    assert.equal(raceMissingEvent.status, 'retry_scheduled');
    assert.equal(raceMissingEvent.retryReason, 'agreement_not_found');
    assert.equal(raceMissingEvent.attemptCount, 1);
    assert.ok(raceMissingEvent.nextAttemptAt);
    assert.equal(externalCalls.length, callsAfterDeploy);

    await insertWebhookAgreement(db, {
      id: 'webhook-race-local-1',
      externalAgreementId: 'external-agreement-race-1',
      address: '0xcccccccccccccccccccccccccccccccccccccccc',
      displayName: 'Webhook Race Local Agreement',
      variables: { scope: 'Before race webhook' },
    });
    const raceRetryEvent = await waitForWebhookEvent(db, raceEvent.id, (event) => event.status === 'processed', {
      projection: { _id: 0, status: 1, retryReason: 1, duplicateDeliveryCount: 1, attemptCount: 1, reconciliation: 1 },
    });
    assert.equal(raceRetryEvent.status, 'processed');
    assert.equal(raceRetryEvent.retryReason, undefined);
    assert.equal(raceRetryEvent.duplicateDeliveryCount, 0);
    assert.equal(raceRetryEvent.attemptCount, 2);
    assert.equal(raceRetryEvent.reconciliation.inputCount, 1);
    const raceAgreement = await db.collection('agreements').findOne(
      { id: 'webhook-race-local-1' },
      { projection: { _id: 0, state: 1, variables: 1, lastWebhookEventId: 1 } },
    );
    assert.equal(raceAgreement.state, 'ACCEPTED');
    assert.equal(raceAgreement.variables.raceAccepted, true);
    assert.equal(raceAgreement.lastWebhookEventId, raceEvent.id);

    await insertWebhookAgreement(db, {
      id: 'webhook-fail-local-1',
      externalAgreementId: 'external-agreement-fail-1',
      address: '0xdddddddddddddddddddddddddddddddddddddddd',
      displayName: 'Webhook Failed Retry Local Agreement',
      variables: { scope: 'Before failed webhook' },
    });
    const failedEvent = transitionEvent({
      id: 'evt_webhook_failed_retry_1',
      agreementId: 'external-agreement-fail-1',
      agreementName: 'Webhook Failed Retry Agreement',
      createdAt: '2026-06-02T18:04:00.000Z',
      fromState: 'PENDING_ACCEPTANCE',
      toState: 'ACCEPTED',
      inputId: 'failAccept',
    });
    const failedFirstResponse = await sendWebhookEvent(port, failedEvent, webhookSecret);
    assert.equal(failedFirstResponse.status, 204, await failedFirstResponse.text());
    const failedStoredEvent = await waitForWebhookEvent(db, failedEvent.id, (event) => event.status === 'retry_scheduled', {
      projection: { _id: 0, status: 1, retryReason: 1, error: 1, attemptCount: 1 },
    });
    assert.equal(failedStoredEvent.status, 'retry_scheduled');
    assert.equal(failedStoredEvent.retryReason, 'reconciliation_failed');
    assert.equal(failedStoredEvent.attemptCount, 1);
    assert.match(failedStoredEvent.error, /temporary external outage/);

    const failedRetryEvent = await waitForWebhookEvent(db, failedEvent.id, (event) => event.status === 'processed', {
      projection: { _id: 0, status: 1, error: 1, duplicateDeliveryCount: 1, attemptCount: 1, reconciliation: 1 },
    });
    assert.equal(failedRetryEvent.status, 'processed');
    assert.equal(failedRetryEvent.error, undefined);
    assert.equal(failedRetryEvent.duplicateDeliveryCount, 0);
    assert.equal(failedRetryEvent.attemptCount, 2);
    assert.equal(failedRetryEvent.reconciliation.inputCount, 1);
    const failedAgreement = await db.collection('agreements').findOne(
      { id: 'webhook-fail-local-1' },
      { projection: { _id: 0, state: 1, variables: 1, lastWebhookEventId: 1 } },
    );
    assert.equal(failedAgreement.state, 'ACCEPTED');
    assert.equal(failedAgreement.variables.failRecovered, true);
    assert.equal(failedAgreement.lastWebhookEventId, failedEvent.id);

    await insertWebhookAgreement(db, {
      id: 'webhook-dead-local-1',
      externalAgreementId: 'external-agreement-dead-1',
      address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      displayName: 'Webhook Dead Letter Local Agreement',
      variables: { scope: 'Before dead letter webhook' },
    });
    const deadEvent = transitionEvent({
      id: 'evt_webhook_dead_letter_1',
      agreementId: 'external-agreement-dead-1',
      agreementName: 'Webhook Dead Letter Agreement',
      createdAt: '2026-06-02T18:05:00.000Z',
      fromState: 'PENDING_ACCEPTANCE',
      toState: 'ACCEPTED',
      inputId: 'deadAccept',
    });
    const deadResponse = await sendWebhookEvent(port, deadEvent, webhookSecret);
    assert.equal(deadResponse.status, 204, await deadResponse.text());
    const deadStoredEvent = await waitForWebhookEvent(db, deadEvent.id, (event) => event.status === 'dead_letter', {
      projection: { _id: 0, status: 1, deadLetterReason: 1, error: 1, attemptCount: 1, maxAttempts: 1 },
      timeoutMs: 5000,
    });
    assert.equal(deadStoredEvent.status, 'dead_letter');
    assert.equal(deadStoredEvent.deadLetterReason, 'reconciliation_failed');
    assert.equal(deadStoredEvent.attemptCount, 2);
    assert.equal(deadStoredEvent.maxAttempts, 2);
    assert.match(deadStoredEvent.error, /persistent external outage/);

    const sharedWebhookAddress = '0xfafafafafafafafafafafafafafafafafafafafa';
    await insertWebhookAgreement(db, {
      id: 'webhook-ambiguous-linea-local-1',
      address: sharedWebhookAddress,
      chainId: 59141,
      displayName: 'Webhook Ambiguous Linea Local Agreement',
      variables: { scope: 'Ambiguous webhook Linea' },
    });
    await insertWebhookAgreement(db, {
      id: 'webhook-ambiguous-base-local-1',
      address: sharedWebhookAddress,
      chainId: 84532,
      displayName: 'Webhook Ambiguous Base Local Agreement',
      variables: { scope: 'Ambiguous webhook Base' },
    });
    const ambiguousAddressEvent = transitionEvent({
      id: 'evt_webhook_ambiguous_address_1',
      agreementId: sharedWebhookAddress,
      agreementName: 'Webhook Ambiguous Address Agreement',
      createdAt: '2026-06-02T18:06:00.000Z',
      fromState: 'PENDING_ACCEPTANCE',
      toState: 'ACCEPTED',
      inputId: 'ambiguousAccept',
    });
    const ambiguousAddressResponse = await sendWebhookEvent(port, ambiguousAddressEvent, webhookSecret);
    assert.equal(ambiguousAddressResponse.status, 204, await ambiguousAddressResponse.text());
    const ambiguousAddressStoredEvent = await waitForWebhookEvent(db, ambiguousAddressEvent.id, (event) => event.status === 'dead_letter', {
      projection: { _id: 0, status: 1, deadLetterReason: 1, error: 1, attemptCount: 1 },
      timeoutMs: 5000,
    });
    assert.deepEqual(ambiguousAddressStoredEvent, {
      status: 'dead_letter',
      deadLetterReason: 'ambiguous_agreement_lookup',
      error: 'Webhook agreement identifier matches multiple local chains',
      attemptCount: 1,
    });

    const acceptedRawBody = JSON.stringify(acceptedEvent);
    const invalidResponse = await fetch(`http://localhost:${port}/shodai/webhooks`, {
      method: 'POST',
      headers: {
        ...webhookHeaders(acceptedRawBody, 'evt_bad_signature', webhookSecret),
        'x-shodai-webhook-signature': 'sha256=bad',
      },
      body: acceptedRawBody,
    });
    assert.equal(invalidResponse.status, 400, await invalidResponse.text());
    assert.equal(await db.collection('webhook_events').countDocuments({ eventId: 'evt_bad_signature' }), 0);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit').catch(() => undefined);
    await mongoClient.db(dbName).dropDatabase();
    await mongoClient.close();
    await new Promise((resolve) => externalServer.close(resolve));
  }
});

async function waitForWebhookEvent(db, eventId, predicate, { projection = { _id: 0 }, timeoutMs = 3000 } = {}) {
  const started = Date.now();
  let lastEvent = null;
  while (Date.now() - started < timeoutMs) {
    lastEvent = await db.collection('webhook_events').findOne(
      { eventId },
      { projection },
    );
    if (lastEvent && predicate(lastEvent)) return lastEvent;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for webhook event ${eventId}; last event: ${JSON.stringify(lastEvent)}`);
}

async function insertWebhookAgreement(db, overrides) {
  const now = new Date().toISOString();
  await db.collection('agreements').insertOne({
    id: overrides.id,
    externalAgreementId: overrides.externalAgreementId,
    address: overrides.address,
    status: 'Deployed',
    chainId: overrides.chainId || 59141,
    displayName: overrides.displayName,
    owner: '0x1111111111111111111111111111111111111111',
    contributors: ['0x1111111111111111111111111111111111111111'],
    json: { metadata: { templateId: 'did:template:webhook-v1' }, execution: { initialState: 'PENDING_ACCEPTANCE' } },
    variables: overrides.variables || {},
    participants: [],
    observers: [],
    state: 'PENDING_ACCEPTANCE',
    createdAt: now,
    updatedAt: now,
  });
}

function transitionEvent({ id, agreementId, agreementName, createdAt, fromState, toState, inputId }) {
  return {
    id,
    type: 'agreement.transitioned',
    apiVersion: '2026-06-01',
    createdAt,
    data: {
      agreementId,
      agreementName,
      templateId: 'did:template:webhook-v1',
      fromState,
      toState,
      inputId,
    },
  };
}

async function sendWebhookEvent(port, event, secret) {
  const rawBody = JSON.stringify(event);
  return fetch(`http://localhost:${port}/shodai/webhooks`, {
    method: 'POST',
    headers: webhookHeaders(rawBody, event.id, secret),
    body: rawBody,
  });
}

function requireBackendSource(sourcePath) {
  if (!backendSourceRegistered) {
    require('reflect-metadata');
    require('ts-node/register');
    require('tsconfig-paths/register');
    backendSourceRegistered = true;
  }

  return require(path.join(appRoot, 'backend/src', sourcePath));
}

function createMockExternalAgreementsService(db) {
  const { ExternalAgreementsService } = requireBackendSource('external/external-agreements.service.ts');
  const { AgreementRepository } = requireBackendSource('database/repositories/agreement.repository.ts');
  const { AgreementInputRepository } = requireBackendSource('database/repositories/agreement-input.repository.ts');
  const { ExternalApiEventRepository } = requireBackendSource('database/repositories/external-api-event.repository.ts');
  const mongo = { collection: async (name) => db.collection(name) };
  return new ExternalAgreementsService(
    {
      externalApiBaseUrl: 'mock',
      defaultAgreementChainId: 59141,
    },
    new AgreementRepository(mongo),
    new AgreementInputRepository(mongo),
    new ExternalApiEventRepository(mongo),
  );
}

async function writeExport(dir, collections) {
  const names = {
    users: 'users.json',
    user_identities: 'user_identities.json',
    user_contacts: 'user_contacts.json',
    user_wallets: 'user_wallets.json',
    agreements: 'agreements.json',
    agreement_inputs: 'inputs.json',
    template_access: 'template_access.json',
  };
  for (const [key, value] of Object.entries(collections)) {
    await fs.writeFile(path.join(dir, names[key]), JSON.stringify(value, null, 2));
  }
}

function migrationFixtureExport() {
  return {
    users: [{ _id: { $oid: '64f000000000000000000001' }, id: 'user-1', email: 'owner@example.com' }],
    user_identities: [{ _id: { $oid: '64f000000000000000000002' }, id: 'identity-1', userId: 'user-1', provider: 'dynamic', subject: 'dyn-user-1' }],
    user_contacts: [{ _id: { $oid: '64f000000000000000000003' }, id: 'contact-1', userId: 'user-1', type: 'email', valueNormalized: 'owner@example.com' }],
    user_wallets: [{ _id: { $oid: '64f000000000000000000004' }, id: 'wallet-1', userId: 'user-1', address: '0x1111111111111111111111111111111111111111' }],
    agreements: [{ _id: { $oid: '64f000000000000000000005' }, id: 'agreement-1', owner: '0x1111111111111111111111111111111111111111' }],
    agreement_inputs: [{ _id: { $oid: '64f000000000000000000006' }, id: 'input-1', agreementId: 'agreement-1', inputId: 'sign' }],
    template_access: [
      { _id: { $oid: '64f000000000000000000007' }, kind: 'global-default', templateIds: ['did:template:mou-v1'] },
      { _id: { $oid: '64f000000000000000000008' }, id: 'access-1', kind: 'user-whitelist', platformUserId: 'user-1', templateIds: ['did:template:msa-v1'] },
    ],
  };
}

async function runMigration(inputDir, { dbName = 'standalone_agreements_migration_test', dryRun = true } = {}) {
  const args = ['scripts/migrate-from-legacy-export.mjs', inputDir];
  if (dryRun) args.push('--dry-run');
  const child = spawn('node', args, {
    cwd: appRoot,
    env: {
      ...process.env,
      MONGO_URI: 'mongodb://localhost:27017',
      MONGO_DB_NAME: dbName,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const [code] = await once(child, 'exit');
  return { code, stdout, stderr, output: `${stdout}${stderr}` };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function successEnvelope(data, requestId = 'req_test') {
  return {
    data,
    meta: { apiVersion: 'v0', requestId },
  };
}

function listEnvelope(data, requestId = 'req_test', pageInfo = {}) {
  return {
    data,
    pageInfo: { limit: 25, nextCursor: null, ...pageInfo },
    meta: { apiVersion: 'v0', requestId },
  };
}

function errorEnvelope(code, message, requestId = 'req_test_error', details) {
  return {
    error: {
      code,
      message,
      details,
      requestId,
    },
  };
}

function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function webhookHeaders(rawBody, eventId, secret, timestamp = String(Math.floor(Date.now() / 1000))) {
  const signature = createHmac('sha256', secret)
    .update(timestamp)
    .update('.')
    .update(rawBody)
    .digest('hex');
  return {
    'content-type': 'application/json',
    'x-shodai-webhook-id': eventId,
    'x-shodai-webhook-timestamp': timestamp,
    'x-shodai-webhook-signature': `sha256=${signature}`,
  };
}

async function waitForHealth(port, child, getLogs) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (child.exitCode !== null) {
      throw new Error(`Nest backend exited early with ${child.exitCode}\n${getLogs()}`);
    }
    try {
      const response = await fetch(`http://localhost:${port}/health`);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`Timed out waiting for Nest backend\n${getLogs()}`);
}

async function readJsonResponse(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function tokenFor({ userId, email, wallet }) {
  return `agreements-dev:${Buffer.from(JSON.stringify({
    userId,
    email,
    wallets: [{ address: wallet, chain: 'EVM', wallet_name: 'Agreements', wallet_provider: 'test' }],
  })).toString('base64url')}`;
}
