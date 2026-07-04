import { parseCaip10Account, parseCaip19Asset } from "../../utils/onchainReferences.ts";
import type { Chain } from "viem";
import * as viemChains from "viem/chains";

interface RetainerBalanceLookupParams {
  availableInputs: Record<string, {
    data?: Record<string, unknown> | null;
  } | null | undefined> | null | undefined;
  recordVariables: Record<string, unknown> | null | undefined;
}

export interface RetainerBalanceLookup {
  retainerAddress: `0x${string}`;
  currencyAddress: `0x${string}`;
  chainId: number;
}

interface RetainerBalanceDisplayParams {
  formattedBalance: string;
  tokenSymbol: string;
}

interface ResolveRetainerBalanceRpcUrlParams {
  chainId: number;
  appChainId: number;
  appRpcUrl: string;
  infuraProjectId: string;
}

function isViemChain(
  value: unknown,
): value is {
  id: number;
  rpcUrls?: { default?: { http?: readonly string[] } };
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id?: unknown }).id === "number" &&
    "rpcUrls" in value
  );
}

function findViemChain(chainId: number): Chain | undefined {
  for (const candidate of Object.values(viemChains) as unknown[]) {
    if (isViemChain(candidate) && candidate.id === chainId) {
      return candidate as Chain;
    }
  }

  return undefined;
}

function hasInvoiceCsvField(
  availableInputs: RetainerBalanceLookupParams["availableInputs"],
): boolean {
  if (!availableInputs) return false;

  return Object.values(availableInputs).some((inputDef) => {
    const inputData = inputDef?.data;
    if (!inputData) return false;

    return Object.values(inputData).some((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const variable = value as { type?: string; subType?: string };
      return (
        variable.type === "string" &&
        String(variable.subType || "").trim().toLowerCase() === "invoice-csv"
      );
    });
  });
}

export function getRetainerBalanceLookup(
  params: RetainerBalanceLookupParams,
): RetainerBalanceLookup | null {
  const { availableInputs, recordVariables } = params;
  if (!hasInvoiceCsvField(availableInputs)) return null;

  const retainerValue = recordVariables?.retainerAddress;
  const currencyValue = recordVariables?.currencyAddress;
  if (typeof retainerValue !== "string" || typeof currencyValue !== "string") return null;

  const retainerAccount = parseCaip10Account(retainerValue);
  const paymentAsset = parseCaip19Asset(currencyValue);
  if (!retainerAccount?.address || !paymentAsset?.address) return null;
  if (retainerAccount.chain.reference !== paymentAsset.chain.reference) return null;

  return {
    retainerAddress: retainerAccount.address as `0x${string}`,
    currencyAddress: paymentAsset.address as `0x${string}`,
    chainId: Number(retainerAccount.chain.reference),
  };
}

export function formatRetainerBalanceDisplay(
  params: RetainerBalanceDisplayParams,
): string {
  const formattedBalance = String(params.formattedBalance || "").trim();
  const tokenSymbol = String(params.tokenSymbol || "").trim();
  return tokenSymbol ? `${formattedBalance} ${tokenSymbol}` : formattedBalance;
}

export function resolveRetainerBalanceRpcUrl(
  params: ResolveRetainerBalanceRpcUrlParams,
): string | undefined {
  const { chainId, appChainId, appRpcUrl, infuraProjectId } = params;

  if (chainId === appChainId && appRpcUrl) {
    return appRpcUrl;
  }

  if (infuraProjectId) {
    if (chainId === 59144) return `https://linea-mainnet.infura.io/v3/${infuraProjectId}`;
    if (chainId === 59141) return `https://linea-sepolia.infura.io/v3/${infuraProjectId}`;
    if (chainId === 11155111) return `https://sepolia.infura.io/v3/${infuraProjectId}`;
    if (chainId === 1) return `https://mainnet.infura.io/v3/${infuraProjectId}`;
  }

  const knownChain = findViemChain(chainId);
  return knownChain?.rpcUrls?.default?.http?.[0];
}
