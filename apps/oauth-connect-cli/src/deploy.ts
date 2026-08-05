import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  computeDefaultDeadlineSeconds,
  deployAgreementWithPermit,
  type ApiClient,
} from '@shodai-network/agreements-api-client';
import { createPublicClient, createWalletClient, http, type Chain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { lineaSepolia } from 'viem/chains';

const PUBLIC_LINEA_SEPOLIA_RPC = 'https://rpc.sepolia.linea.build';
const DEFAULT_COUNTERPARTY = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

export const defaultAgreementPath = fileURLToPath(
  new URL('../fixtures/mou.json', import.meta.url),
);

export type DeployCliOptions = {
  walletPrivateKey: string;
  agreementPath: string;
  chainId: number;
  rpcUrl: string;
  counterparty: string;
  displayName: string;
  partyAKey: string;
  partyBKey: string;
};

export function resolveDeployOptions(args: string[]): DeployCliOptions {
  const walletPrivateKey = (
    flagValue(args, '--wallet-key') ||
    process.env.LINKED_WALLET_PRIVATE_KEY ||
    process.env.WALLET_PRIVATE_KEY ||
    ''
  ).trim();

  const chainId = Number(
    flagValue(args, '--chain-id') || process.env.CHAIN_ID || String(lineaSepolia.id),
  );
  const rpcUrl = (
    flagValue(args, '--rpc-url') ||
    process.env.AGREEMENTS_RPC_URL ||
    (chainId === lineaSepolia.id ? PUBLIC_LINEA_SEPOLIA_RPC : '')
  )
    .trim()
    .replace(/\/+$/, '');

  const agreementPath = (
    flagValue(args, '--agreement') ||
    process.env.AGREEMENT_JSON_PATH ||
    defaultAgreementPath
  ).trim();

  return {
    walletPrivateKey,
    agreementPath,
    chainId,
    rpcUrl,
    counterparty: (
      flagValue(args, '--counterparty') ||
      process.env.COUNTERPARTY_WALLET ||
      DEFAULT_COUNTERPARTY
    )
      .trim()
      .toLowerCase(),
    displayName:
      flagValue(args, '--name') ||
      process.env.DISPLAY_NAME ||
      `shodai-oauth deploy ${new Date().toISOString().slice(0, 19)}`,
    partyAKey: flagValue(args, '--party-a-key') || 'partyAEthAddress',
    partyBKey: flagValue(args, '--party-b-key') || 'partyBEthAddress',
  };
}

export async function deployWithLinkedWallet(
  client: ApiClient,
  options: DeployCliOptions,
): Promise<{ id: string; address?: string; chainId?: number; signerAddress: string }> {
  if (!options.walletPrivateKey.startsWith('0x')) {
    throw new Error(
      'Signing wallet required. Set LINKED_WALLET_PRIVATE_KEY (or WALLET_PRIVATE_KEY),\n' +
        'or pass --wallet-key 0x...\n' +
        'Link the address first: developer portal → Profile → Wallets → Link wallet.',
    );
  }
  if (!options.rpcUrl) {
    throw new Error(
      `No RPC URL for chain ${options.chainId}. Pass --rpc-url or set AGREEMENTS_RPC_URL.`,
    );
  }
  if (!existsSync(options.agreementPath)) {
    throw new Error(`Agreement JSON not found: ${options.agreementPath}`);
  }

  const agreement = JSON.parse(readFileSync(options.agreementPath, 'utf8'));
  const account = privateKeyToAccount(options.walletPrivateKey as `0x${string}`);
  const signerAddress = account.address.toLowerCase();
  const counterparty = options.counterparty;

  const chain: Chain =
    options.chainId === lineaSepolia.id
      ? lineaSepolia
      : {
          ...lineaSepolia,
          id: options.chainId,
          name: `agreements-${options.chainId}`,
          rpcUrls: { default: { http: [options.rpcUrl] } },
        };

  const publicClient = createPublicClient({ chain, transport: http(options.rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(options.rpcUrl) });

  const block = await publicClient.getBlockNumber();
  console.log(`RPC ok: ${options.rpcUrl} block=${block} chainId=${options.chainId}`);
  console.log(`Signer: ${signerAddress} (must be linked to the OAuth user)`);
  console.log(`Agreement JSON: ${options.agreementPath}`);

  const deployed = await deployAgreementWithPermit({
    client,
    walletClient,
    publicClient,
    chainId: options.chainId,
    // Template JSON is validated by the protocol factory at sign/deploy time.
    agreement: agreement as Parameters<typeof deployAgreementWithPermit>[0]['agreement'],
    displayName: options.displayName,
    initValues: {
      [options.partyAKey]: signerAddress,
      [options.partyBKey]: counterparty,
    },
    participants: [
      { variableKey: options.partyAKey, walletAddress: signerAddress },
      { variableKey: options.partyBKey, walletAddress: counterparty },
    ],
    deadline: computeDefaultDeadlineSeconds(),
  });

  return {
    id: deployed.id,
    address: deployed.address,
    chainId: deployed.chainId,
    signerAddress,
  };
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return undefined;
}
