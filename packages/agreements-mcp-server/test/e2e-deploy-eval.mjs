/**
 * Manual full-lifecycle eval against a live gateway (testnet chain). Not run by `pnpm test`.
 *
 * Usage:
 *   AGREEMENTS_API_BASE_URL=... EVAL_API_KEY=... EVAL_API_ENVIRONMENT=testnet node test/e2e-deploy-eval.mjs
 *
 * Exercises custody mode 2 end to end through the MCP server:
 * validate -> preflight -> prepare_deployment_typed_data -> local sign ->
 * deploy_agreement -> get_agreement_state -> prepare_input_typed_data ->
 * local sign -> submit_input -> get_input_history.
 * Uses ephemeral wallets; nothing is persisted.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { startAgreementsMcpHttpServer } from '../dist/index.js';

const baseUrl = process.env.AGREEMENTS_API_BASE_URL;
const apiKey = process.env.EVAL_API_KEY;
const environment = process.env.EVAL_API_ENVIRONMENT ?? 'testnet';
if (!baseUrl || !apiKey) {
  console.error('Set AGREEMENTS_API_BASE_URL and EVAL_API_KEY.');
  process.exit(1);
}

const CHAIN_ID = 59141;

const partyA = privateKeyToAccount(generatePrivateKey());
const partyB = privateKeyToAccount(generatePrivateKey());

const server = await startAgreementsMcpHttpServer({
  port: 0,
  host: '127.0.0.1',
  baseUrls: { [environment]: baseUrl },
});
const mcpUrl = new URL(`http://127.0.0.1:${server.address().port}/mcp`);
const client = new Client({ name: 'e2e-deploy-eval', version: '0.0.1' });
await client.connect(
  new StreamableHTTPClientTransport(mcpUrl, { requestInit: { headers: { 'X-API-Key': apiKey } } }),
);

async function call(name, args) {
  const result = await client.callTool({ name, arguments: { environment, ...args } });
  const text = result.content?.[0]?.text ?? '';
  if (result.isError) {
    throw new Error(`${name} failed: ${text.slice(0, 600)}`);
  }
  return JSON.parse(text);
}

function reviveTypedData(typedData) {
  return {
    ...typedData,
    message: Object.fromEntries(
      Object.entries(typedData.message).map(([key, value]) => [
        key,
        ['nonce', 'deadline'].includes(key) ? BigInt(value) : value,
      ]),
    ),
  };
}

function splitSignature(signatureHex) {
  return {
    signatureR: `0x${signatureHex.slice(2, 66)}`,
    signatureS: `0x${signatureHex.slice(66, 130)}`,
    signatureV: parseInt(signatureHex.slice(130, 132), 16),
  };
}

const agreement = JSON.parse(
  readFileSync(new URL('../content/simple-agreement.json', import.meta.url), 'utf8'),
);
const initValues = {
  partyAEthAddress: partyA.address,
  partyBEthAddress: partyB.address,
};
const participants = [
  { variableKey: 'partyAEthAddress', walletAddress: partyA.address },
  { variableKey: 'partyBEthAddress', walletAddress: partyB.address },
];

const report = { partyA: partyA.address, partyB: partyB.address };

// 1. Validate + preflight.
const validation = await call('validate_agreement', { agreement });
assert.deepEqual(validation.warnings, []);
const preflight = await call('preflight_deployment', {
  agreement,
  chainId: CHAIN_ID,
  initValues,
  participants,
});
report.preflightWarnings = preflight.warnings;

// 2. Prepare deploy permit, sign locally, deploy with the pre-signed permit.
const preparedDeploy = await call('prepare_deployment_typed_data', {
  agreement,
  chainId: CHAIN_ID,
  signerAddress: partyA.address,
  initValues,
  participants,
});
const deploySignature = splitSignature(
  await partyA.signTypedData(reviveTypedData(preparedDeploy.typedData)),
);
const deployed = await call('deploy_agreement', {
  agreement,
  displayName: 'MCP e2e eval (simple MOU)',
  chainId: CHAIN_ID,
  initValues: preparedDeploy.normalizedInitValues,
  participants: preparedDeploy.normalizedParticipants,
  observers: preparedDeploy.normalizedObservers,
  signer: partyA.address,
  deadline: preparedDeploy.deadline,
  ...deploySignature,
});
report.agreementId = deployed.id;
report.agreementAddress = deployed.address;
report.deployedStatus = deployed.status;

// 3. Read state.
const state = await call('get_agreement_state', { agreementId: deployed.id });
report.initialState = state.state;

// 4. Prepare input permit for partyAData, sign, submit.
const inputValues = {
  partyAName: 'MCP Eval Party A',
  scope: 'Evaluate the Agreements MCP server end to end.',
  termDuration: '6 months',
  effectiveDate: new Date().toISOString(),
};
const preparedInput = await call('prepare_input_typed_data', {
  agreementId: deployed.id,
  inputId: 'partyAData',
  values: inputValues,
  signerAddress: partyA.address,
});
const inputSignature = splitSignature(
  await partyA.signTypedData(reviveTypedData(preparedInput.typedData)),
);
const submitted = await call('submit_input', {
  agreementId: deployed.id,
  inputId: 'partyAData',
  values: inputValues,
  signer: partyA.address,
  deadline: preparedInput.deadline,
  ...inputSignature,
});
report.inputStatus = submitted.status;
report.txHash = submitted.txHash;

// 5. Confirm history + state.
const history = await call('get_input_history', { agreementId: deployed.id });
report.historyCount = history.data.length;
const finalState = await call('get_agreement_state', { agreementId: deployed.id });
report.stateAfterSubmit = finalState.state;

console.log(JSON.stringify(report, null, 2));

await client.close();
server.close();
