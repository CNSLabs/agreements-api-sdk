import { resolveIssuerAddresses, resolveStateLabel, toMillis } from "@/utils/agreementsUi";

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
};

export function computeAvailableActions(params: {
  agreements: AvailableActionsAgreement[] | undefined;
  userAddress: string | undefined;
}): AvailableActionItem[] {
  const { agreements, userAddress } = params;
  if (!agreements || agreements.length === 0) return [];
  if (!userAddress) return [];
  const user = userAddress.toLowerCase();

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
      if (!issuers.some((issuer) => issuer.toLowerCase() === user)) continue;

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
        ctaLabel: "Review now",
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
