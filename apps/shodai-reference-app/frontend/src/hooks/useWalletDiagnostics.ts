import * as React from "react";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { hexToBytes, keccak256 } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useAuthInit } from "@/components/AuthInitContext";

export type WalletDiagnosticReport = {
  id: string;
  capturedAt: string;
  flow: string;
  stage: string;
  page: {
    origin: string | null;
    path: string | null;
    href: string | null;
  };
  browser: {
    userAgent: string | null;
    language: string | null;
    onLine: boolean | null;
    cookieEnabled: boolean | null;
  };
  storage: {
    localStorageAvailable: boolean;
    sessionStorageAvailable: boolean;
  };
  wallet: {
    connectedAddress: string | null;
    accountChainId: number | null;
    publicClientChainId: number | null;
    walletClientChainId: number | null;
    walletClientAccount: string | null;
  };
  dynamic: {
    sdkHasLoaded: boolean | null;
    primaryWallet: {
      address: string | null;
      chain: string | null;
      key: string | null;
      provider: string | null;
      connectorName: string | null;
      walletName: string | null;
      walletVersion: string | null;
      isAuthenticated: boolean | null;
    };
    user: {
      id: string | null;
      sessionId: string | null;
      lastVerifiedCredentialId: string | null;
      email: string | null;
      verifiedCredentialCount: number | null;
    };
  };
  platform: {
    authStatus: "idle" | "loading" | "ready" | "error";
    user: {
      id: string | null;
      platformUserId: string | null;
      email: string | null;
    };
    wallet: {
      address: string | null;
      chain: string | null;
      walletName: string | null;
      walletProvider: string | null;
    };
  };
  context: Record<string, unknown>;
  error: Record<string, unknown>;
};

type CaptureDiagnosticParams = {
  flow: string;
  stage: string;
  context?: Record<string, unknown>;
  error: unknown;
};

type TypedDataDomain = {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: string;
};

type TypedDataField = {
  name: string;
  type: string;
};

function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function storageAvailable(kind: "localStorage" | "sessionStorage"): boolean {
  try {
    const storage = window[kind];
    const key = `__agreements_diag_${randomId()}`;
    storage.setItem(key, "1");
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function serializeValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 3) return "[MaxDepthExceeded]";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => serializeValue(item, depth + 1));
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 50);
    return Object.fromEntries(entries.map(([key, item]) => [key, serializeValue(item, depth + 1)]));
  }
  return String(value);
}

function normalizeDiagnosticContext(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 8) return "[MaxDepthExceeded]";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeDiagnosticContext(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        normalizeDiagnosticContext(item, depth + 1),
      ])
    );
  }
  return String(value);
}

function isHexString(value: string): boolean {
  return /^0x[0-9a-fA-F]*$/.test(value) && value.length % 2 === 0;
}

function previewString(value: string, max = 80): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.floor(max / 2))}...${value.slice(-Math.floor(max / 3))}`;
}

export function summarizeValueForDiagnostic(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 2) return "[MaxDepthExceeded]";

  if (typeof value === "string") {
    if (isHexString(value)) {
      const byteLength = hexToBytes(value as `0x${string}`).length;
      return {
        type: "hex",
        byteLength,
        preview: previewString(value, 42),
        hash: byteLength > 32 ? keccak256(value as `0x${string}`) : null,
      };
    }
    return {
      type: "string",
      length: value.length,
      preview: previewString(value),
    };
  }

  if (typeof value === "bigint") {
    return { type: "bigint", value: value.toString() };
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return { type: typeof value, value };
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      items: value.slice(0, 10).map((item) => summarizeValueForDiagnostic(item, depth + 1)),
    };
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 30);
    return {
      type: "object",
      keys: entries.map(([key]) => key),
      entries: Object.fromEntries(
        entries.map(([key, item]) => [key, summarizeValueForDiagnostic(item, depth + 1)])
      ),
    };
  }

  return { type: typeof value, value: String(value) };
}

export function summarizeRecordForDiagnostic(
  record: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, summarizeValueForDiagnostic(value)])
  );
}

export function summarizeTypedDataForDiagnostic(params: {
  domain: TypedDataDomain;
  primaryType: string;
  types: Record<string, ReadonlyArray<TypedDataField>>;
  message: Record<string, unknown>;
}) {
  const { domain, primaryType, types, message } = params;
  return {
    primaryType,
    domain: summarizeRecordForDiagnostic(domain as Record<string, unknown>),
    types: Object.fromEntries(
      Object.entries(types).map(([typeName, fields]) => [
        typeName,
        fields.map((field) => ({ name: field.name, type: field.type })),
      ])
    ),
    message: summarizeRecordForDiagnostic(message),
  };
}

function serializeError(error: unknown): Record<string, unknown> {
  const err = error as any;
  return {
    name: err?.name ?? null,
    message: err?.message ?? String(error),
    shortMessage: err?.shortMessage ?? null,
    details: err?.details ?? null,
    code: err?.code ?? null,
    cause: serializeValue(err?.cause),
    stack: typeof err?.stack === "string" ? err.stack : null,
    response: err?.response
      ? {
          status: err.response.status ?? null,
          data: serializeValue(err.response.data),
        }
      : null,
    request: err?.config
      ? {
          method: err.config.method ?? null,
          url: err.config.url ?? null,
          baseURL: err.config.baseURL ?? null,
        }
      : null,
    metaMessages: Array.isArray(err?.metaMessages) ? err.metaMessages.slice(0, 20) : null,
    raw: serializeValue(err),
  };
}

export function formatDiagnosticReport(report: WalletDiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}

export function useWalletDiagnostics() {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const dynamicContext = useDynamicContext() as any;
  const authInit = useAuthInit();

  return React.useCallback(
    ({ flow, stage, context = {}, error }: CaptureDiagnosticParams): WalletDiagnosticReport => {
      const primaryWallet = dynamicContext?.primaryWallet as any;
      const user = dynamicContext?.user as any;
      const platformWallet = Array.isArray(authInit.user?.wallets) ? authInit.user.wallets[0] : null;

      const report: WalletDiagnosticReport = {
        id: `diag_${Date.now()}_${randomId()}`,
        capturedAt: new Date().toISOString(),
        flow,
        stage,
        page: {
          origin: window.location.origin ?? null,
          path: window.location.pathname ?? null,
          href: window.location.href ?? null,
        },
        browser: {
          userAgent: navigator.userAgent ?? null,
          language: navigator.language ?? null,
          onLine: typeof navigator.onLine === "boolean" ? navigator.onLine : null,
          cookieEnabled: typeof navigator.cookieEnabled === "boolean" ? navigator.cookieEnabled : null,
        },
        storage: {
          localStorageAvailable: storageAvailable("localStorage"),
          sessionStorageAvailable: storageAvailable("sessionStorage"),
        },
        wallet: {
          connectedAddress: address ?? null,
          accountChainId: chain?.id ?? null,
          publicClientChainId: publicClient?.chain?.id ?? null,
          walletClientChainId: (walletClient as any)?.chain?.id ?? null,
          walletClientAccount: (walletClient as any)?.account?.address ?? null,
        },
        dynamic: {
          sdkHasLoaded: typeof dynamicContext?.sdkHasLoaded === "boolean" ? dynamicContext.sdkHasLoaded : null,
          primaryWallet: {
            address: primaryWallet?.address ?? null,
            chain: primaryWallet?.chain ?? null,
            key: primaryWallet?.key ?? null,
            provider: primaryWallet?.provider ?? null,
            connectorName:
              primaryWallet?.connector?.name ??
              primaryWallet?.walletConnector?.name ??
              null,
            walletName: primaryWallet?.name ?? primaryWallet?.walletName ?? null,
            walletVersion:
              primaryWallet?.embeddedWallet?.version ??
              primaryWallet?.walletProperties?.version ??
              primaryWallet?.version ??
              null,
            isAuthenticated:
              typeof primaryWallet?.isAuthenticated === "boolean" ? primaryWallet.isAuthenticated : null,
          },
          user: {
            id: user?.userId ?? user?.id ?? null,
            sessionId: user?.sessionId ?? null,
            lastVerifiedCredentialId: user?.lastVerifiedCredentialId ?? null,
            email: user?.email ?? null,
            verifiedCredentialCount: Array.isArray(user?.verifiedCredentials)
              ? user.verifiedCredentials.length
              : null,
          },
        },
        platform: {
          authStatus: authInit.status,
          user: {
            id: authInit.user?.id ?? null,
            platformUserId:
              typeof authInit.user?.platformUserId === "string" ? authInit.user.platformUserId : null,
            email: authInit.user?.email ?? null,
          },
          wallet: {
            address: typeof platformWallet?.address === "string" ? platformWallet.address : null,
            chain: typeof platformWallet?.chain === "string" ? platformWallet.chain : null,
            walletName:
              typeof platformWallet?.wallet_name === "string" ? platformWallet.wallet_name : null,
            walletProvider:
              typeof platformWallet?.wallet_provider === "string" ? platformWallet.wallet_provider : null,
          },
        },
        context: normalizeDiagnosticContext(context) as Record<string, unknown>,
        error: serializeError(error),
      };

      const globalWindow = window as any;
      const existingReports = Array.isArray(globalWindow.__agreementsDiagnostics)
        ? globalWindow.__agreementsDiagnostics
        : [];
      globalWindow.__agreementsDiagnostics = [...existingReports, report].slice(-20);
      globalWindow.__agreementsLastDiagnostic = report;

      console.error(`[agreements-diagnostics:${report.id}]`, report);

      return report;
    },
    [address, authInit.status, authInit.user, chain?.id, dynamicContext, publicClient?.chain?.id, walletClient]
  );
}
