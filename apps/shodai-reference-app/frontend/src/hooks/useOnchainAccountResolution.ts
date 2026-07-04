import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { getSafeAppUrl, parseCaip10Account } from "@/utils/onchainReferences";

export type ResolvedOnchainAccountType = "safe" | "account";

export interface ResolvedOnchainAccount {
  accountType: ResolvedOnchainAccountType;
  safeAppUrl?: string;
}

async function detectSafeAccount(caip10Value: string): Promise<ResolvedOnchainAccount> {
  const details = parseCaip10Account(caip10Value);
  if (!details?.address || !details.chain.safeConfig?.transactionServiceUrl) {
    return { accountType: "account" };
  }

  const endpoint = `${details.chain.safeConfig.transactionServiceUrl}/api/v1/safes/${details.address}/`;

  try {
    const response = await fetch(endpoint, { method: "GET" });
    if (response.ok) {
      return {
        accountType: "safe",
        safeAppUrl: getSafeAppUrl(caip10Value),
      };
    }
    if (response.status === 404) {
      return { accountType: "account" };
    }
  } catch {
    return { accountType: "account" };
  }

  return { accountType: "account" };
}

export function useOnchainAccountResolution(value: unknown, subType?: string) {
  const caip10Value = React.useMemo(
    () => (typeof value === "string" && subType === "caip10Account" ? value : ""),
    [subType, value]
  );
  const details = React.useMemo(() => parseCaip10Account(caip10Value), [caip10Value]);

  return useQuery({
    queryKey: ["onchain-account-resolution", caip10Value],
    queryFn: () => detectSafeAccount(caip10Value),
    enabled: !!caip10Value && !!details?.chain.safeConfig?.transactionServiceUrl,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
