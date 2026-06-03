import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const outputFile = 'THIRD_PARTY_NOTICES.md';
const reviewLicensePatterns = [
  /^Unknown$/i,
  /^LGPL/i,
  /^MPL/i,
  /^FSL/i,
  /^CC-BY/i,
  /^Python-2\.0$/i,
  /^BSD$/i,
];

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});

async function main() {
  const checkOnly = process.argv.includes('--check');
  const inventory = await loadLicenseInventory();
  const markdown = renderNotices(inventory);

  if (checkOnly) {
    const existing = await fs.readFile(outputFile, 'utf8').catch(() => '');
    if (existing !== markdown) {
      throw new Error(`${outputFile} is out of date. Run pnpm notices:generate.`);
    }
    console.log(`${outputFile} is up to date.`);
    return;
  }

  await fs.writeFile(outputFile, markdown);
  console.log(`Wrote ${outputFile}.`);
}

async function loadLicenseInventory() {
  const { stdout } = await execFileAsync('pnpm', ['licenses', 'list', '--json'], {
    maxBuffer: 1024 * 1024 * 64,
  });
  const grouped = JSON.parse(stdout);
  const entries = [];

  for (const [license, packages] of Object.entries(grouped)) {
    for (const item of packages) {
      entries.push({
        name: item.name,
        versions: [...new Set(item.versions || [])].sort(compareVersions),
        license,
        homepage: item.homepage || item.repository?.url || '',
        description: item.description || '',
      });
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name) || a.license.localeCompare(b.license));
  return entries;
}

function renderNotices(entries) {
  const summary = summarizeByLicense(entries);
  const reviewEntries = entries.filter((entry) => requiresReview(entry.license));

  const lines = [
    '# Third-Party Notices',
    '',
    'Generated from the pnpm lockfile with `pnpm licenses list --json`.',
    '',
    'This file is a dependency license inventory for release review. It is not a substitute for legal review, and it does not replace license texts that individual dependencies may require in distributed artifacts.',
    '',
    'Regenerate it after dependency changes:',
    '',
    '```sh',
    'pnpm notices:generate',
    'pnpm notices:check',
    '```',
    '',
    '## License Summary',
    '',
    '| License | Packages |',
    '| --- | ---: |',
    ...summary.map(([license, count]) => `| ${cell(license)} | ${count} |`),
    '',
    '## Licenses Requiring Human Review',
    '',
  ];

  if (reviewEntries.length === 0) {
    lines.push('No dependency license categories matched the review list.');
  } else {
    lines.push('| Package | Versions | License | Homepage |');
    lines.push('| --- | --- | --- | --- |');
    for (const entry of reviewEntries) {
      lines.push(renderEntryRow(entry));
    }
  }

  lines.push(
    '',
    '## Dependency Inventory',
    '',
    '| Package | Versions | License | Homepage |',
    '| --- | --- | --- | --- |',
  );

  for (const entry of entries) {
    lines.push(renderEntryRow(entry));
  }

  lines.push('');
  return `${lines.join('\n')}`;
}

function summarizeByLicense(entries) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry.license, (counts.get(entry.license) || 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function renderEntryRow(entry) {
  const homepage = entry.homepage ? `[link](${entry.homepage})` : '';
  return `| ${cell(entry.name)} | ${cell(entry.versions.join(', '))} | ${cell(entry.license)} | ${homepage} |`;
}

function requiresReview(license) {
  return reviewLicensePatterns.some((pattern) => pattern.test(license));
}

function cell(value) {
  return String(value || '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
    .trim();
}

function compareVersions(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}
