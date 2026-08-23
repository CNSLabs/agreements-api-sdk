import { resolveIssuerAddresses, resolveStateLabel, toMillis } from "./agreementsUi.ts";

export type AvailableActionsAgreement = {
  id?: string;
  address: string;
  chainId?: number;
  onChainRef?: string;
  state?: string;
  variables?: Record<string, unknown>;
  updatedAt?: string | Date;
  createdAt?: string | Date;
  json?: any;
  displayName: string;
};

/**
 * How the current user relates to an action's issuer wallet:
 * - `ready` — the connected wallet can sign it now.
 * - `switch-wallet` — a wallet linked to this account can sign it; the user
 *   has to make it active first.
 * - `other-wallet` — the issuer is a wallet this account has not linked. The
 *   work still exists and the required address is named, so it stays
 *   discoverable instead of silently vanishing from the queue.
 */
export type ActionAvailability = "ready" | "switch-wallet" | "other-wallet";

export type AvailableActionItem = {
  agreementId: string;
  agreementKey: string;
  agreementAddress: string;
  agreementName: string;
  agreementUpdatedAt?: string | Date;
  chainId?: number;
  currentState?: string;
  currentStateLabel?: string;
  inputId: string;
  inputLabel: string;
  ctaLabel: string;
  availability: ActionAvailability;
  /** Wallets the agreement names as this action's issuer, lowercased. */
  requiredWallets: string[];
};

export function computeAvailableActions(params: {
  agreements: AvailableActionsAgreement[] | undefined;
  userAddress: string | undefined;
  /** Every wallet linked to the signed-in account, not just the active one. */
  userWallets?: string[];
}): AvailableActionItem[] {
  const { agreements, userAddress, userWallets } = params;
  if (!agreements || agreements.length === 0) return [];
  if (!userAddress) return [];
  const user = userAddress.toLowerCase();
  const linked = new Set((userWallets || []).map((wallet) => wallet.toLowerCase()));

  const items: AvailableActionItem[] = [];

  for (const a of agreements) {
    const agreementJson = a?.json;
    const currentState = a?.state;
    if (!agreementJson || !currentState) continue;

    const transitions = Array.isArray(agreementJson?.execution?.transitions)
      ? agreementJson.execution.transitions
      : [];

    const inputIds: string[] = [];
    for (const t of transitions) {
      if (t?.from !== currentState) continue;
      const conds = Array.isArray(t?.conditions) ? t.conditions : [];
      for (const c of conds) {
        const inputId = c?.input;
        if (typeof inputId === "string" && inputId && !inputIds.includes(inputId)) {
          inputIds.push(inputId);
        }
      }
    }

    for (const inputId of inputIds) {
      const inputDef = agreementJson?.execution?.inputs?.[inputId];
      if (!inputDef) continue;

      const issuers = resolveIssuerAddresses(inputDef?.issuer, a?.variables);
      if (issuers.length === 0) continue;
      const requiredWallets = issuers.map((issuer) => issuer.toLowerCase());
      // Wallet mismatch is a classification, not a filter: an action whose
      // issuer is a custom EOA must stay in the queue with the required
      // address named, or wallet-switching users lose sight of their own
      // pending work.
      const availability: ActionAvailability = requiredWallets.includes(user)
        ? "ready"
        : requiredWallets.some((wallet) => linked.has(wallet))
          ? "switch-wallet"
          : "other-wallet";

      const agreementName = a?.displayName || agreementJson?.metadata?.name || "Agreement";
      const inputLabel = inputDef?.displayName || inputId;
      const agreementId = (a as { id?: string }).id || a.address;
      items.push({
        agreementId,
        agreementKey: agreementActionKey(a, agreementId),
        agreementAddress: a.address,
        agreementName,
        agreementUpdatedAt: a.updatedAt || a.createdAt,
        chainId: a.chainId,
        currentState,
        currentStateLabel: resolveStateLabel({ agreementJson, stateId: currentState }),
        inputId,
        inputLabel,
        ctaLabel: availability === "ready" ? "Review now" : "View",
        availability,
        requiredWallets,
      });
    }
  }

  items.sort((x, y) => toMillis(y.agreementUpdatedAt) - toMillis(x.agreementUpdatedAt));
  return items;
}

function agreementActionKey(agreement: AvailableActionsAgreement, agreementId: string): string {
  const onChainRef = typeof agreement.onChainRef === "string" ? agreement.onChainRef.trim() : "";
  if (onChainRef) return onChainRef.toLowerCase();
  if (agreement.chainId && agreement.address) {
    return `eip155:${agreement.chainId}:${agreement.address.toLowerCase()}`;
  }
  return agreementId;
}
