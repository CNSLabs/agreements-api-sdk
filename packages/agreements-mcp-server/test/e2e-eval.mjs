/**
 * Manual end-to-end eval against a live gateway. Not run by `pnpm test`.
 *
 * Usage:
 *   AGREEMENTS_API_BASE_URL=... EVAL_API_KEY=... EVAL_API_ENVIRONMENT=testnet node test/e2e-eval.mjs
 *
 * Exercises the Phase 1 authoring loop through the MCP server:
 * resources -> validate_agreement -> preflight_deployment -> list_agreements.
 */
import assert from 'node:assert/strict';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { startAgreementsMcpHttpServer } from '../dist/index.js';

const baseUrl = process.env.AGREEMENTS_API_BASE_URL;
const apiKey = process.env.EVAL_API_KEY;
const environment = process.env.EVAL_API_ENVIRONMENT ?? 'testnet';
if (!baseUrl || !apiKey) {
  console.error('Set AGREEMENTS_API_BASE_URL and EVAL_API_KEY.');
  process.exit(1);
}

const mcpServer = await startAgreementsMcpHttpServer({
  port: 0,
  host: '127.0.0.1',
  baseUrls: { [environment]: baseUrl },
});
const mcpUrl = new URL(`http://127.0.0.1:${mcpServer.address().port}/mcp`);

const client = new Client({ name: 'e2e-eval', version: '0.0.1' });
await client.connect(
  new StreamableHTTPClientTransport(mcpUrl, { requestInit: { headers: { 'X-API-Key': apiKey } } }),
);

const report = {};

// 1. Learn the agreement shape from the bundled example resource.
const simple = await client.readResource({ uri: 'agreements://examples/simple-agreement.json' });
const agreement = JSON.parse(simple.contents[0].text);
report.resourceLoaded = agreement.metadata.templateId;

// 2. Validate structure.
const validation = await client.callTool({ name: 'validate_agreement', arguments: { environment, agreement } });
assert.notEqual(validation.isError, true, `validate_agreement failed: ${validation.content?.[0]?.text}`);
const validationPayload = JSON.parse(validation.content[0].text);
report.validation = {
  participantVariableKeys: validationPayload.participantVariableKeys,
  inputIds: validationPayload.inputIds,
  stateCount: validationPayload.stateIds?.length,
  warnings: validationPayload.warnings,
};

// 3. Preflight deployment with placeholder participant wallets.
const participants = (validationPayload.participantVariableKeys ?? []).map((variableKey, index) => ({
  variableKey,
  walletAddress: `0x${String(index + 1).repeat(40).slice(0, 40)}`,
}));
const preflight = await client.callTool({
  name: 'preflight_deployment',
  arguments: { environment, agreement, participants },
});
const preflightText = preflight.content[0].text;
report.preflight = preflight.isError ? `error: ${preflightText.slice(0, 300)}` : JSON.parse(preflightText);

// 4. Authenticated read.
const list = await client.callTool({ name: 'list_agreements', arguments: { environment, limit: 3 } });
assert.notEqual(list.isError, true, `list_agreements failed: ${list.content?.[0]?.text}`);
const listPayload = JSON.parse(list.content[0].text);
report.listAgreements = {
  count: listPayload.data.length,
  nextCursor: listPayload.pageInfo?.nextCursor ?? null,
};

console.log(JSON.stringify(report, null, 2));

await client.close();
mcpServer.close();
