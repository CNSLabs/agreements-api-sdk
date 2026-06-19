/**
 * Signing custody helpers for the write tools.
 *
 * Three custody modes are supported by `deploy_agreement` / `submit_input`:
 * 1. Pre-signed permit passed in tool input (agent-held key or external wallet tooling).
 * 2. `prepare_*_typed_data` companion tools return the exact EIP-712 payload to sign.
 * 3. Local stdio mode signs with `AGREEMENTS_SIGNER_PRIVATE_KEY` from the environment
 *    (dev/testnet pattern; never configure a production key this way).
 *
 * Mode 2 reuses the SDK's own permit construction by running it against a
 * "capture account" whose `signTypedData` records the payload instead of signing,
 * so the returned typed data can never drift from what the SDK would sign.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount, toAccount } from 'viem/accounts';
import * as viemChains from 'viem/chains';
import {
  signAgreementInputPermit,
  signDeployWithPermit,
} from '@cns-labs/agreements-api-client';

/** Placeholder 65-byte signature returned by the capture account (discarded). */
const DUMMY_SIGNATURE: Hex = `0x${'11'.repeat(64)}1b`;

export function resolveChain(chainId: number): Chain | undefined {
  const candidates = Object.values(viemChains) as unknown[];
  return candidates.find(
    (candidate): candidate is Chain =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'id' in candidate &&
      (candidate as Chain).id === chainId &&
      'rpcUrls' in candidate,
  );
}

export function resolveRpcUrl(chainId: number): string | undefined {
  return (
    process.env[`AGREEMENTS_RPC_URL_${chainId}`]?.trim() ||
    process.env.AGREEMENTS_RPC_URL?.trim() ||
    resolveInfuraRpcUrl(chainId, process.env.INFURA_PROJECT_ID?.trim()) ||
    undefined
  );
}

function resolveInfuraRpcUrl(chainId: number, infuraProjectId: string | undefined): string | undefined {
  if (!infuraProjectId) return undefined;
  if (chainId === viemChains.linea.id) return `https://linea-mainnet.infura.io/v3/${infuraProjectId}`;
  if (chainId === viemChains.lineaSepolia.id) return `https://linea-sepolia.infura.io/v3/${infuraProjectId}`;
  if (chainId === viemChains.sepolia.id) return `https://sepolia.infura.io/v3/${infuraProjectId}`;
  if (chainId === viemChains.base.id) return `https://base-mainnet.infura.io/v3/${infuraProjectId}`;
  if (chainId === viemChains.baseSepolia.id) return `https://base-sepolia.infura.io/v3/${infuraProjectId}`;
  return undefined;
}

export function createChainPublicClient(chainId: number): PublicClient {
  const chain = resolveChain(chainId);
  const rpcUrl = resolveRpcUrl(chainId);
  if (!chain && !rpcUrl) {
    throw new Error(
      `No RPC endpoint known for chain ${chainId}. Set AGREEMENTS_RPC_URL, AGREEMENTS_RPC_URL_${chainId}, or INFURA_PROJECT_ID.`,
    );
  }
  return createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
}

/** Returns the env-configured signer account, if any (custody mode 3). */
export function getEnvSignerAccount() {
  const privateKey = process.env.AGREEMENTS_SIGNER_PRIVATE_KEY?.trim();
  if (!privateKey) return undefined;
  return privateKeyToAccount(privateKey as Hex);
}

export function createEnvSignerWalletClient(chainId: number): WalletClient | undefined {
  const account = getEnvSignerAccount();
  if (!account) return undefined;
  return createWalletClient({
    account,
    chain: resolveChain(chainId),
    transport: http(resolveRpcUrl(chainId)),
  });
}

function createCaptureWalletClient(
  signerAddress: Address,
  chainId: number,
  onCapture: (typedData: unknown) => void,
): WalletClient {
  const account = toAccount({
    address: signerAddress,
    async signMessage() {
      throw new Error('Capture account cannot sign messages.');
    },
    async signTransaction() {
      throw new Error('Capture account cannot sign transactions.');
    },
    async signTypedData(typedData) {
      onCapture(typedData);
      return DUMMY_SIGNATURE;
    },
  });
  return createWalletClient({
    account,
    chain: resolveChain(chainId),
    transport: http(resolveRpcUrl(chainId)),
  });
}

export type PreparedTypedData = {
  /** Full EIP-712 payload: domain, types, primaryType, message. */
  typedData: unknown;
  signerAddress: Address;
  chainId: number;
  deadline: number;
};

/** Builds the factory deploy-with-permit EIP-712 payload for an external signer. */
export async function prepareDeployTypedData(params: {
  agreement: Record<string, unknown>;
  chainId: number;
  signerAddress: Address;
  deadline: number;
  initValues?: Record<string, unknown>;
  docUri?: string;
}): Promise<PreparedTypedData> {
  let captured: unknown;
  const walletClient = createCaptureWalletClient(params.signerAddress, params.chainId, (typedData) => {
    captured = typedData;
  });
  const publicClient = createChainPublicClient(params.chainId);

  await signDeployWithPermit({
    walletClient,
    publicClient,
    chainId: params.chainId,
    agreement: params.agreement as never,
    deadline: params.deadline,
    permitOptions:
      params.initValues !== undefined || params.docUri !== undefined
        ? {
            ...(params.docUri !== undefined ? { docUri: params.docUri } : {}),
            ...(params.initValues !== undefined ? { initValues: params.initValues as never } : {}),
          }
        : undefined,
  });

  if (captured === undefined) {
    throw new Error('Failed to capture the deploy permit typed data.');
  }
  return {
    typedData: captured,
    signerAddress: params.signerAddress,
    chainId: params.chainId,
    deadline: params.deadline,
  };
}

/** Builds the engine input-permit EIP-712 payload for an external signer. */
export async function prepareInputTypedData(params: {
  agreement: Record<string, unknown>;
  agreementContractAddress: Address;
  chainId: number;
  inputId: string;
  values: Record<string, unknown>;
  signerAddress: Address;
  deadline: number;
}): Promise<PreparedTypedData> {
  let captured: unknown;
  const walletClient = createCaptureWalletClient(params.signerAddress, params.chainId, (typedData) => {
    captured = typedData;
  });
  const publicClient = createChainPublicClient(params.chainId);

  await signAgreementInputPermit({
    walletClient,
    publicClient,
    chainId: params.chainId,
    agreementContractAddress: params.agreementContractAddress,
    agreement: params.agreement as never,
    inputId: params.inputId,
    values: params.values,
    deadline: params.deadline,
  });

  if (captured === undefined) {
    throw new Error('Failed to capture the input permit typed data.');
  }
  return {
    typedData: captured,
    signerAddress: params.signerAddress,
    chainId: params.chainId,
    deadline: params.deadline,
  };
}
