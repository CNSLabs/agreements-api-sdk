import { isAddress } from "viem";

export interface OnchainReferenceVariable {
  type?: string;
  subType?: string;
  name?: string;
}

export interface ParsedCaip2Chain {
  namespace: "eip155";
  reference: string;
  caip2: string;
  chainName: string;
  explorerBaseUrl?: string;
  safeConfig?: {
    transactionServiceUrl: string;
    safeAppChainPrefix: string;
  };
}

export interface ParsedOnchainReference {
  kind: "chain" | "account" | "asset";
  subType: string;
  chain: ParsedCaip2Chain;
  address?: string;
  assetNamespace?: string;
  explorerUrl?: string;
}

export interface Eip155ChainOption {
  reference: string;
  caip2: string;
  chainName: string;
}

const EIP155_CHAIN_REGEX = /^eip155:(\d+)$/i;
const CAIP10_ACCOUNT_REGEX = /^(eip155:\d+):(0x[a-fA-F0-9]{40})$/;
const CAIP19_ASSET_REGEX = /^(eip155:\d+)\/([a-z0-9-]{1,32}):([^/]+)$/i;

const KNOWN_EIP155_CHAINS: Record<
  string,
  {
    name: string;
    explorerBaseUrl?: string;
    safeConfig?: {
      transactionServiceUrl: string;
      safeAppChainPrefix: string;
    };
  }
> = {
  "1": {
    name: "Ethereum",
    explorerBaseUrl: "https://etherscan.io",
    safeConfig: {
      transactionServiceUrl: "https://safe-transaction-mainnet.safe.global",
      safeAppChainPrefix: "eth",
    },
  },
  "10": {
    name: "Optimism",
    explorerBaseUrl: "https://optimistic.etherscan.io",
    safeConfig: {
      transactionServiceUrl: "https://safe-transaction-optimism.safe.global",
      safeAppChainPrefix: "oeth",
    },
  },
  "100": {
    name: "Gnosis",
    explorerBaseUrl: "https://gnosisscan.io",
    safeConfig: {
      transactionServiceUrl: "https://safe-transaction-gnosis-chain.safe.global",
      safeAppChainPrefix: "gno",
    },
  },
  "137": {
    name: "Polygon",
    explorerBaseUrl: "https://polygonscan.com",
    safeConfig: {
      transactionServiceUrl: "https://safe-transaction-polygon.safe.global",
      safeAppChainPrefix: "matic",
    },
  },
  "8453": {
    name: "Base",
    explorerBaseUrl: "https://basescan.org",
    safeConfig: {
      transactionServiceUrl: "https://safe-transaction-base.safe.global",
      safeAppChainPrefix: "base",
    },
  },
  "42161": {
    name: "Arbitrum",
    explorerBaseUrl: "https://arbiscan.io",
    safeConfig: {
      transactionServiceUrl: "https://safe-transaction-arbitrum.safe.global",
      safeAppChainPrefix: "arb1",
    },
  },
  "59141": { name: "Linea Sepolia", explorerBaseUrl: "https://sepolia.lineascan.build" },
  "59144": {
    name: "Linea",
    explorerBaseUrl: "https://lineascan.build",
    safeConfig: {
      transactionServiceUrl: "https://safe-transaction-linea.safe.global",
      safeAppChainPrefix: "linea",
    },
  },
  "11155111": {
    name: "Sepolia",
    explorerBaseUrl: "https://sepolia.etherscan.io",
    safeConfig: {
      transactionServiceUrl: "https://safe-transaction-sepolia.safe.global",
      safeAppChainPrefix: "sep",
    },
  },
};

export const EIP155_CHAIN_OPTIONS: Eip155ChainOption[] = Object.entries(KNOWN_EIP155_CHAINS)
  .map(([reference, details]) => ({
    reference,
    caip2: `eip155:${reference}`,
    chainName: details.name,
  }))
  .sort((a, b) => a.chainName.localeCompare(b.chainName));

function shortAddress(value: string): string {
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatAssetNamespace(assetNamespace: string): string {
  if (assetNamespace.toLowerCase() === "erc20") return "ERC-20";
  return assetNamespace.toUpperCase();
}

export function isOnchainReferenceSubType(subType: string | undefined): boolean {
  return subType === "caip2Chain" || subType === "caip10Account" || subType === "caip19Asset";
}

export function parseCaip2Chain(value: string): ParsedCaip2Chain | null {
  const match = String(value).trim().match(EIP155_CHAIN_REGEX);
  if (!match) return null;
  const reference = match[1];
  const known = KNOWN_EIP155_CHAINS[reference];
  return {
    namespace: "eip155",
    reference,
    caip2: `eip155:${reference}`,
    chainName: known?.name || `EVM Chain ${reference}`,
    explorerBaseUrl: known?.explorerBaseUrl,
    safeConfig: known?.safeConfig,
  };
}

export function getSafeAppUrl(caip10Value: string): string | undefined {
  const details = parseCaip10Account(caip10Value);
  if (!details?.address || !details.chain.safeConfig?.safeAppChainPrefix) return undefined;
  return `https://app.safe.global/home?safe=${details.chain.safeConfig.safeAppChainPrefix}:${details.address}`;
}

export function buildCaip2Chain(reference: string): string {
  return reference ? `eip155:${reference}` : "";
}

export function buildCaip10Account(reference: string, address: string): string {
  const chain = buildCaip2Chain(reference);
  const normalizedAddress = String(address || "").trim();
  if (!chain && !normalizedAddress) return "";
  return `${chain}:${normalizedAddress}`;
}

export function buildCaip19Asset(reference: string, assetReference: string, assetNamespace = "erc20"): string {
  const chain = buildCaip2Chain(reference);
  const normalizedReference = String(assetReference || "").trim();
  if (!chain && !normalizedReference) return "";
  return `${chain}/${assetNamespace}:${normalizedReference}`;
}

export function decomposeOnchainReferenceValue(
  value: string,
  subType: string | undefined
): { chainReference: string; address: string; assetNamespace: string } {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return { chainReference: "", address: "", assetNamespace: "erc20" };
  }

  if (subType === "caip2Chain") {
    const chain = parseCaip2Chain(normalized);
    return {
      chainReference: chain?.reference || normalized.replace(/^eip155:/i, ""),
      address: "",
      assetNamespace: "erc20",
    };
  }

  if (subType === "caip10Account") {
    const match = normalized.match(/^(?:eip155:(\d+))(?::(.*))?$/i);
    return {
      chainReference: match?.[1] || "",
      address: match?.[2] || "",
      assetNamespace: "erc20",
    };
  }

  if (subType === "caip19Asset") {
    const match = normalized.match(/^(?:eip155:(\d+))(?:\/([^:]+))?:(.*)$/i);
    return {
      chainReference: match?.[1] || "",
      assetNamespace: match?.[2] || "erc20",
      address: match?.[3] || "",
    };
  }

  return { chainReference: "", address: "", assetNamespace: "erc20" };
}

export function parseCaip10Account(value: string): ParsedOnchainReference | null {
  const match = String(value).trim().match(CAIP10_ACCOUNT_REGEX);
  if (!match) return null;
  const chain = parseCaip2Chain(match[1]);
  const address = match[2];
  if (!chain || !isAddress(address)) return null;
  return {
    kind: "account",
    subType: "caip10Account",
    chain,
    address,
    explorerUrl: chain.explorerBaseUrl ? `${chain.explorerBaseUrl}/address/${address}` : undefined,
  };
}

export function parseCaip19Asset(value: string): ParsedOnchainReference | null {
  const match = String(value).trim().match(CAIP19_ASSET_REGEX);
  if (!match) return null;
  const chain = parseCaip2Chain(match[1]);
  const assetNamespace = match[2];
  const assetReference = match[3];
  if (!chain || !assetNamespace || !assetReference) return null;
  if (assetReference.startsWith("0x") && !isAddress(assetReference)) return null;
  return {
    kind: "asset",
    subType: "caip19Asset",
    chain,
    address: assetReference,
    assetNamespace,
    explorerUrl:
      chain.explorerBaseUrl && assetReference.startsWith("0x")
        ? `${chain.explorerBaseUrl}/token/${assetReference}`
        : undefined,
  };
}

export function getOnchainReferenceDetails(
  value: unknown,
  variable?: OnchainReferenceVariable | null
): ParsedOnchainReference | null {
  if (typeof value !== "string" || !variable?.subType) return null;
  if (variable.subType === "caip2Chain") {
    const chain = parseCaip2Chain(value);
    if (!chain) return null;
    return {
      kind: "chain",
      subType: variable.subType,
      chain,
      explorerUrl: chain.explorerBaseUrl,
    };
  }
  if (variable.subType === "caip10Account") {
    return parseCaip10Account(value);
  }
  if (variable.subType === "caip19Asset") {
    return parseCaip19Asset(value);
  }
  return null;
}

export function validateOnchainReferenceValue(
  variable: OnchainReferenceVariable,
  value: string
): true | string {
  if (!isOnchainReferenceSubType(variable.subType)) return true;
  const details = getOnchainReferenceDetails(value, variable);
  if (details) return true;

  const label = variable.name || "Value";
  if (variable.subType === "caip2Chain") {
    return `${label} must be a valid CAIP-2 chain ID`;
  }
  if (variable.subType === "caip10Account") {
    return `${label} must be a valid CAIP-10 account ID`;
  }
  return `${label} must be a valid CAIP-19 asset ID`;
}

export function formatOnchainReferenceValue(
  value: unknown,
  variable?: OnchainReferenceVariable | null,
  options?: { mode?: "compact" | "inline" | "document" }
): string {
  const details = getOnchainReferenceDetails(value, variable);
  if (!details) {
    return value == null ? "" : String(value);
  }

  const mode = options?.mode || "inline";
  if (details.kind === "chain") {
    return mode === "document" ? `${details.chain.chainName} (${details.chain.caip2})` : details.chain.chainName;
  }

  if (details.kind === "account" && details.address) {
    if (mode === "compact") return shortAddress(details.address);
    if (mode === "document") return `${details.address} on ${details.chain.chainName}`;
    return `${shortAddress(details.address)} (${details.chain.chainName})`;
  }

  if (details.kind === "asset" && details.address && details.assetNamespace) {
    const assetLabel = formatAssetNamespace(details.assetNamespace);
    if (mode === "compact") return `${assetLabel} ${shortAddress(details.address)}`;
    if (mode === "document") return `${assetLabel} ${details.address} on ${details.chain.chainName}`;
    return `${assetLabel} ${shortAddress(details.address)} (${details.chain.chainName})`;
  }

  return String(value);
}
