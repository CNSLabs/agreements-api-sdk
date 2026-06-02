import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const require = createRequire(path.join(APP_ROOT, 'backend', 'package.json'));
const { MongoClient } = require('mongodb');
const templatesDir = process.env.AGREEMENT_TEMPLATES_DIR || path.join(APP_ROOT, 'data', 'agreement-templates');

const mongoUri = process.env.MONGO_URI;
const mongoDbName = process.env.MONGO_DB_NAME || process.env.MONGO_DB;
const owner = process.env.AGREEMENTS_SEED_OWNER_WALLET?.toLowerCase();
const email = process.env.AGREEMENTS_SEED_OWNER_EMAIL?.toLowerCase();
const platformUserId = process.env.AGREEMENTS_SEED_PLATFORM_USER_ID || randomUUID();
const draftId = process.env.AGREEMENTS_SEED_AGREEMENT_ID || randomUUID();
const now = new Date().toISOString();

if (!mongoUri || !mongoDbName) {
  console.error('MONGO_URI and MONGO_DB_NAME are required. Refusing to seed JSON-file storage.');
  process.exit(1);
}

if (!owner || !/^0x[0-9a-fA-F]{40}$/.test(owner)) {
  console.error('AGREEMENTS_SEED_OWNER_WALLET must be set to a real EVM wallet address. Refusing to create deterministic fake wallets.');
  process.exit(1);
}

if (!email || !email.includes('@')) {
  console.error('AGREEMENTS_SEED_OWNER_EMAIL must be set to the seeded owner email.');
  process.exit(1);
}

const template = JSON.parse(await fs.readFile(path.join(templatesDir, 'customer-invoice-prototype.json'), 'utf8'));
const templateId = template.metadata?.templateId || template.metadata?.id;
if (!templateId) throw new Error('customer-invoice-prototype template is missing metadata.templateId');

const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
await client.connect();

try {
  const db = client.db(mongoDbName);
  await db.collection('platform_users').updateOne(
    { id: platformUserId },
    { $set: { id: platformUserId, status: 'ACTIVE', createdAt: now, updatedAt: now } },
    { upsert: true },
  );
  await db.collection('user_contacts').updateOne(
    { userId: platformUserId, type: 'email', valueNormalized: email },
    {
      $set: {
        id: `contact:${platformUserId}:email:${email}`,
        userId: platformUserId,
        type: 'email',
        value: email,
        valueNormalized: email,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  await db.collection('user_wallets').updateOne(
    { userId: platformUserId, address: owner },
    {
      $set: {
        id: `wallet:${platformUserId}:eip155:1:${owner}`,
        userId: platformUserId,
        chainId: 1,
        address: owner,
        did: `did:pkh:eip155:1:${owner}`,
        source: 'dynamic',
        createdAt: now,
      },
    },
    { upsert: true },
  );
  await db.collection('template_access').updateOne(
    { kind: 'user-whitelist', platformUserId },
    { $set: { kind: 'user-whitelist', platformUserId, templateIds: [templateId], updatedAt: now } },
    { upsert: true },
  );
  await db.collection('agreements').updateOne(
    { id: draftId },
    {
      $set: {
        id: draftId,
        status: 'Draft',
        chainId: Number(process.env.DEFAULT_AGREEMENTS_CHAIN_ID || process.env.AGREEMENTS_DEFAULT_CHAIN_ID || 59141),
        displayName: 'Seeded standalone draft',
        owner,
        json: template,
        variables: {},
        participants: [],
        observers: [],
        contributors: [owner],
        createdAt: now,
        updatedAt: now,
        migrationSource: { kind: 'seed-local', seededAt: now },
      },
    },
    { upsert: true },
  );

  console.log(JSON.stringify({
    database: mongoDbName,
    platformUserId,
    owner,
    email,
    draftId,
    templateId,
  }, null, 2));
} finally {
  await client.close();
}
