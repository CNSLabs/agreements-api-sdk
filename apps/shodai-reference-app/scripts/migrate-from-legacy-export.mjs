import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');
const require = createRequire(path.join(APP_ROOT, 'backend', 'package.json'));
const { MongoClient } = require('mongodb');
const inputDir = process.env.LEGACY_EXPORT_DIR || process.argv.find((arg) => !arg.startsWith('--') && arg !== process.argv[0] && arg !== process.argv[1]);
const dryRun = process.argv.includes('--dry-run') || process.env.LEGACY_MIGRATION_DRY_RUN === 'true';
const mongoUri = process.env.MONGO_URI;
const mongoDbName = process.env.MONGO_DB_NAME || process.env.MONGO_DB;
const SOURCE_MONGO_ID = Symbol('sourceMongoId');

const collectionSpecs = [
  { target: 'platform_users', aliases: ['platform_users.json', 'users.json'], requiredIds: [], domainKey: 'id' },
  { target: 'user_identities', aliases: ['user_identities.json', 'identities.json'], requiredIds: ['userId'], domainKey: 'id' },
  { target: 'user_contacts', aliases: ['user_contacts.json', 'contacts.json'], requiredIds: ['userId'], domainKey: 'id' },
  { target: 'user_wallets', aliases: ['user_wallets.json', 'wallets.json'], requiredIds: ['userId'], domainKey: 'id' },
  { target: 'agreements', aliases: ['agreements.json'], requiredIds: [], domainKey: 'id' },
  { target: 'agreement_inputs', aliases: ['agreement_inputs.json', 'inputs.json'], requiredIds: ['agreementId'], domainKey: 'id' },
  { target: 'template_access', aliases: ['template_access.json'], requiredIds: [], domainKey: templateAccessDomainKey },
];

if (!inputDir) {
  console.error('Usage: MONGO_URI=mongodb://... MONGO_DB_NAME=standalone LEGACY_EXPORT_DIR=/path/to/export node scripts/migrate-from-legacy-export.mjs [--dry-run]');
  console.error('Expected collection JSON exports: platform_users/users, user_identities, user_contacts, user_wallets, agreements, agreement_inputs/inputs, and template_access.');
  process.exit(1);
}

if (!mongoUri || !mongoDbName) {
  console.error('MONGO_URI and MONGO_DB_NAME are required. Refusing to migrate into JSON-file storage.');
  process.exit(1);
}

const migratedAt = new Date().toISOString();
const source = path.resolve(inputDir);
const loaded = new Map();

try {
  for (const spec of collectionSpecs) {
    loaded.set(spec.target, await readFirst(spec.aliases));
  }
} catch (error) {
  console.error('Migration validation failed:');
  console.error(`- ${error.message}`);
  process.exit(1);
}

const validation = validateExport(loaded);
if (validation.errors.length > 0) {
  console.error('Migration validation failed:');
  for (const error of validation.errors) console.error(`- ${error}`);
  process.exit(1);
}

const migrationId = `migration:${hashStable({
  source,
  collections: Object.fromEntries([...loaded.entries()].map(([name, docs]) => [name, docs.map((doc) => domainKeyFor(name, doc))])),
})}`;
const mappings = buildMappings(loaded);
const summary = {
  id: migrationId,
  source,
  targetDatabase: mongoDbName,
  dryRun,
  collections: Object.fromEntries([...loaded.entries()].map(([name, docs]) => [name, docs.length])),
  mappings: Object.fromEntries(Object.entries(mappings).map(([name, docs]) => [name, docs.length])),
  warnings: validation.warnings,
};

if (!dryRun) {
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  try {
    const db = client.db(mongoDbName);
    for (const [collectionName, documents] of loaded.entries()) {
      if (documents.length === 0) continue;
      const collection = db.collection(collectionName);
      const operations = documents.map((document) => ({
        replaceOne: {
          filter: upsertFilterFor(collectionName, document),
          replacement: document,
          upsert: true,
        },
      }));
      await collection.bulkWrite(operations, { ordered: true });
    }

    await db.collection('migration_mappings').updateOne({ id: migrationId }, {
      $set: {
        id: migrationId,
        source,
        migratedAt,
        updatedAt: migratedAt,
        preservedIds: true,
        dryRun: false,
        summary: summary.collections,
        mappings,
      },
      $setOnInsert: {
        createdAt: migratedAt,
      },
    }, {
      upsert: true,
    });
    await db.collection('migration_mappings').updateOne({ id: 'latest' }, {
      $set: {
        id: 'latest',
        migrationId,
        source,
        migratedAt,
        updatedAt: migratedAt,
        preservedIds: true,
        dryRun: false,
        summary: summary.collections,
        mappings,
      },
      $setOnInsert: {
        createdAt: migratedAt,
      },
    }, {
      upsert: true,
    });
    summary.mappingDocuments = {
      migrationId,
      latest: true,
    };
  } finally {
    await client.close();
  }
}

console.log(JSON.stringify(summary, null, 2));

async function readFirst(names) {
  for (const name of names) {
    const filePath = path.join(inputDir, name);
    const value = await readJson(filePath);
    if (value !== null) return normalizeExport(value, name);
  }
  return [];
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      throw new Error(`${path.basename(filePath)} contains malformed JSON: ${error.message}`);
    }
    throw error;
  }
}

function normalizeExport(value, name) {
  const documents = Array.isArray(value) ? value : value?.documents;
  if (!Array.isArray(documents)) {
    throw new Error(`${name} must be a JSON array or an object with a documents array`);
  }
  return documents.map((document, index) => {
    if (!document || typeof document !== 'object' || Array.isArray(document)) {
      throw new Error(`${name}[${index}] must be an object`);
    }
    return stripMongoId(document);
  });
}

function stripMongoId(document) {
  const { _id, ...rest } = document;
  Object.defineProperty(rest, SOURCE_MONGO_ID, {
    enumerable: false,
    value: _id?.$oid || _id?.toString?.() || null,
  });
  return rest;
}

function validateExport(collections) {
  const errors = [];
  const warnings = [];
  const users = new Set((collections.get('platform_users') || []).map((doc) => doc.id).filter(Boolean));
  const agreements = new Set((collections.get('agreements') || []).map((doc) => doc.id).filter(Boolean));

  for (const spec of collectionSpecs) {
    const seenDomainKeys = new Set();
    for (const [index, document] of (collections.get(spec.target) || []).entries()) {
      const domainKey = domainKeyFor(spec.target, document);
      if (!domainKey) errors.push(`${spec.target}[${index}] is missing domain key`);
      if (domainKey && seenDomainKeys.has(domainKey)) errors.push(`${spec.target} contains duplicate domain key ${domainKey}`);
      if (domainKey) seenDomainKeys.add(domainKey);

      for (const field of spec.requiredIds) {
        if (!document[field]) errors.push(`${spec.target}[${document.id || index}] is missing ${field}`);
      }

      if (spec.target.startsWith('user_') && document.userId && !users.has(document.userId)) {
        errors.push(`${spec.target}[${document.id || index}] references missing platform user ${document.userId}`);
      }

      if (spec.target === 'agreement_inputs' && document.agreementId && !agreements.has(document.agreementId)) {
        errors.push(`${spec.target}[${document.id || index}] references missing agreement ${document.agreementId}`);
      }
    }
  }

  for (const [index, entry] of (collections.get('template_access') || []).entries()) {
    if (!['global-default', 'user-whitelist'].includes(entry.kind)) {
      errors.push(`template_access[${entry.id || index}] has unsupported kind ${entry.kind || '<missing>'}`);
    }
    if (entry.kind === 'global-default' && entry.platformUserId) {
      errors.push(`template_access[${entry.id || entry.kind}] global-default must not include platformUserId`);
    }
    if (entry.kind === 'user-whitelist' && !entry.platformUserId) {
      errors.push(`template_access[${entry.id || entry.kind}] user-whitelist is missing platformUserId`);
    }
    if (entry.kind === 'user-whitelist' && entry.platformUserId && !users.has(entry.platformUserId)) {
      errors.push(`template_access[${entry.id || entry.kind}] references missing platform user ${entry.platformUserId}`);
    }
    if (!Array.isArray(entry.templateIds)) {
      errors.push(`template_access[${entry.id || entry.kind}] templateIds must be an array`);
    } else if (entry.templateIds.some((templateId) => typeof templateId !== 'string' || templateId.length === 0)) {
      errors.push(`template_access[${entry.id || entry.kind}] templateIds must contain non-empty strings`);
    }
  }

  for (const [collectionName, documents] of collections.entries()) {
    if (documents.length === 0) warnings.push(`${collectionName} has no import documents`);
  }

  return { errors, warnings };
}

function upsertFilterFor(collectionName, document) {
  if (collectionName === 'template_access') {
    return {
      kind: document.kind,
      platformUserId: document.platformUserId ?? null,
    };
  }
  return { id: document.id };
}

function domainKeyFor(collectionName, document) {
  if (collectionName === 'template_access') return templateAccessDomainKey(document);
  return document?.id;
}

function templateAccessDomainKey(document) {
  if (!document?.kind) return null;
  if (document.kind === 'global-default') return 'global-default';
  if (document.kind === 'user-whitelist' && document.platformUserId) return `user-whitelist:${document.platformUserId}`;
  return document.id || null;
}

function buildMappings(collections) {
  return Object.fromEntries([...collections.entries()].map(([collectionName, documents]) => [
    collectionName,
    documents.map((document) => ({
      sourceMongoId: mongoIdString(document),
      domainKey: domainKeyFor(collectionName, document),
      targetCollection: collectionName,
      targetFilter: upsertFilterFor(collectionName, document),
      preservedDomainId: domainKeyFor(collectionName, document),
    })),
  ]));
}

function mongoIdString(document) {
  return document?.[SOURCE_MONGO_ID] || null;
}

function hashStable(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 24);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
