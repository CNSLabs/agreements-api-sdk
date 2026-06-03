import type { Chain } from "viem";
import { base, baseSepolia, lineaSepolia, linea, mainnet, sepolia } from "viem/chains";
import type { EvmNetwork } from "@dynamic-labs/types";

export interface ChainConfig {
  chainId: number;
  chain: Chain;
  chainName: string;
  rpcUrl: string;
  blockExplorerUrl: string;
  network: string;
  factoryAddress?: string;
}

export interface RuntimeAgreementConfig {
  agreementsApiEnvironment: "testnet" | "production" | string;
  defaultChainId: number;
  supportedChains: ChainConfig[];
}

type BackendChainConfig = {
  chainId: number;
  network: string;
  factoryAddress?: string;
};

type BackendRuntimeConfig = {
  agreementsApiEnvironment: string;
  defaultChainId: number;
  supportedChains: BackendChainConfig[];
};

const AGREEMENTS_API_URL = import.meta.env.VITE_AGREEMENTS_API_BASE_URL || "";
const KNOWN_CHAINS = [lineaSepolia, linea, baseSepolia, base, sepolia, mainnet] as const;
let runtimeAgreementConfig: RuntimeAgreementConfig | null = null;

export function getDynamicEvmNetwork(chainConfig: ChainConfig): EvmNetwork {
  return {
    blockExplorerUrls: [chainConfig.blockExplorerUrl],
    chain: "EVM",
    chainId: chainConfig.chainId,
    iconUrls: [],
    isTestnet: chainConfig.chain.testnet ?? false,
    name: chainConfig.chainName,
    nativeCurrency: chainConfig.chain.nativeCurrency,
    networkId: chainConfig.chainId,
    privateCustomerRpcUrls: [chainConfig.rpcUrl],
    rpcUrls: [chainConfig.rpcUrl],
    vanityName: chainConfig.chainName,
  };
}

export async function loadRuntimeAgreementConfig(): Promise<RuntimeAgreementConfig> {
  if (runtimeAgreementConfig) return runtimeAgreementConfig;
  const response = await fetch(`${AGREEMENTS_API_URL}/agreements-api/config`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to load agreements chain config (${response.status})`);
  }
  const body = (await response.json()) as BackendRuntimeConfig;
  const supportedChains = (body.supportedChains || []).map(toChainConfig);
  if (supportedChains.length === 0) {
    throw new Error("No supported agreement chains were returned by the backend");
  }
  const defaultChainId = supportedChains.some((chain) => chain.chainId === body.defaultChainId)
    ? body.defaultChainId
    : supportedChains[0].chainId;
  runtimeAgreementConfig = {
    agreementsApiEnvironment: body.agreementsApiEnvironment,
    defaultChainId,
    supportedChains,
  };
  return runtimeAgreementConfig;
}

export function getRuntimeAgreementConfig(): RuntimeAgreementConfig {
  if (!runtimeAgreementConfig) {
    throw new Error("Agreement chain config has not loaded yet");
  }
  return runtimeAgreementConfig;
}

export function getSupportedChainConfigs(): ChainConfig[] {
  return getRuntimeAgreementConfig().supportedChains;
}

export function getDefaultChainConfig(): ChainConfig {
  const config = getRuntimeAgreementConfig();
  return getChainConfig(config.defaultChainId);
}

export function getChainConfig(chainId?: number): ChainConfig {
  const config = getRuntimeAgreementConfig();
  const desiredChainId = chainId ?? config.defaultChainId;
  const chainConfig = config.supportedChains.find((chain) => chain.chainId === desiredChainId);
  if (!chainConfig) {
    throw new Error(`Unsupported agreements chainId ${desiredChainId}`);
  }
  return chainConfig;
}

export function getChainLabel(chainId: number | undefined | null): string {
  if (!chainId) return "Unknown chain";
  try {
    return getChainConfig(chainId).chainName;
  } catch {
    return `Chain ${chainId}`;
  }
}

export function getBlockExplorerUrlForChain(chainId: number | undefined | null): string {
  if (!chainId) return "https://etherscan.io";
  try {
    return getChainConfig(chainId).blockExplorerUrl;
  } catch {
    return "https://etherscan.io";
  }
}

export function isSupportedAgreementChainId(chainId: number | undefined | null): boolean {
  if (!chainId) return false;
  return getRuntimeAgreementConfig().supportedChains.some((chain) => chain.chainId === chainId);
}

function toChainConfig(chainInfo: BackendChainConfig): ChainConfig {
  const chain = KNOWN_CHAINS.find((candidate) => candidate.id === chainInfo.chainId);
  if (!chain) {
    throw new Error(`Backend returned unsupported frontend chain ${chainInfo.chainId}`);
  }
  return {
    chainId: chain.id,
    chain,
    chainName: chain.name,
    rpcUrl: resolveRpcUrl(chain),
    blockExplorerUrl: chain.blockExplorers?.default?.url || "https://etherscan.io",
    network: chainInfo.network,
    factoryAddress: chainInfo.factoryAddress,
  };
}

function resolveRpcUrl(chain: Chain): string {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  const explicit = env[`VITE_AGREEMENTS_RPC_URL_${chain.id}`] || env.VITE_AGREEMENTS_RPC_URL;
  if (explicit) return explicit;

  const infuraProjectId = env.VITE_INFURA_PROJECT_ID;
  if (infuraProjectId) {
    if (chain.id === linea.id) return `https://linea-mainnet.infura.io/v3/${infuraProjectId}`;
    if (chain.id === lineaSepolia.id) return `https://linea-sepolia.infura.io/v3/${infuraProjectId}`;
    if (chain.id === base.id) return `https://base-mainnet.infura.io/v3/${infuraProjectId}`;
    if (chain.id === baseSepolia.id) return `https://base-sepolia.infura.io/v3/${infuraProjectId}`;
    if (chain.id === sepolia.id) return `https://sepolia.infura.io/v3/${infuraProjectId}`;
    if (chain.id === mainnet.id) return `https://mainnet.infura.io/v3/${infuraProjectId}`;
  }

  return chain.rpcUrls.default.http[0];
}
