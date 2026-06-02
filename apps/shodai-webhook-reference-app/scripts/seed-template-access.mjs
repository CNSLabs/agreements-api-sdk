#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const require = createRequire(path.join(ROOT, 'backend', 'package.json'));
const { MongoClient } = require('mongodb');

const options = parseArgs(process.argv.slice(2));
loadEnvFile(path.join(ROOT, 'backend/.env'));

const mongoUri = process.env.MONGO_URI;
const mongoDbName = process.env.MONGO_DB_NAME || process.env.MONGO_DB;
const templatesDir = process.env.AGREEMENT_TEMPLATES_DIR || path.join(ROOT, 'data', 'agreement-templates');
const templateIds = await readTemplateIds(templatesDir);

if (!mongoUri || !mongoDbName) {
  throw new Error('MONGO_URI and MONGO_DB_NAME are required to seed template access');
}

if (templateIds.length === 0) {
  throw new Error(`No templates found in ${templatesDir}`);
}

const now = new Date().toISOString();
const record = {
  kind: 'global-default',
  templateIds,
  updatedAt: now,
  source: 'seed-template-access',
};

if (options.dryRun) {
  console.log(JSON.stringify({ dryRun: true, database: mongoDbName, record }, null, 2));
  process.exit(0);
}

const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
await client.connect();

try {
  const db = client.db(mongoDbName);
  await db.collection('template_access').createIndex({ kind: 1, platformUserId: 1 });
  await db.collection('template_access').updateOne(
    { kind: 'global-default' },
    { $set: record, $unset: { platformUserId: '' } },
    { upsert: true },
  );
  console.log(JSON.stringify({ ok: true, database: mongoDbName, templateIds }, null, 2));
} finally {
  await client.close();
}

function parseArgs(args) {
  const parsed = { dryRun: false };
  for (const arg of args) {
    if (arg === '--') {
      continue;
    }
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: pnpm templates:seed-defaults -- [--dry-run]');
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

async function readTemplateIds(dir) {
  const files = (await fs.readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  const ids = [];
  for (const file of files) {
    const template = JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'));
    const templateId = String(template.metadata?.templateId || '').trim();
    if (!templateId) {
      throw new Error(`${file} is missing metadata.templateId`);
    }
    ids.push(templateId);
  }
  return [...new Set(ids)];
}

function loadEnvFile(filePath) {
  let contents;
  try {
    contents = require('node:fs').readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const delimiterIndex = trimmed.indexOf('=');
    if (delimiterIndex === -1) continue;
    const key = trimmed.slice(0, delimiterIndex).trim();
    let value = trimmed.slice(delimiterIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
