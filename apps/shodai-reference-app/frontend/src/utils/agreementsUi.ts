import { isAddress } from "viem";

export function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const n = Date.parse(String(v));
  return Number.isFinite(n) ? n : 0;
}

export function formatWhen(v: unknown): string {
  const ms = toMillis(v);
  if (!ms) return "";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

export function resolveStateLabel(params: { agreementJson?: any; stateId?: string }): string | undefined {
  const { agreementJson, stateId } = params;
  if (!stateId) return undefined;
  const def = agreementJson?.execution?.states?.[stateId];
  const name = def?.name || def?.displayName;
  return typeof name === "string" && name.trim() ? name : stateId;
}

export function isTerminalStateByDfsm(params: { agreementJson?: any; state?: string }): boolean {
  const { agreementJson, state } = params;
  if (!agreementJson || !state) return false;
  const transitions = Array.isArray(agreementJson?.execution?.transitions)
    ? agreementJson.execution.transitions
    : [];
  return transitions.filter((t: any) => t?.from === state).length === 0;
}

/**
 * Returns true if the given template ID matches the purchase-order-auto-pay-actions template.
 * Handles both the canonical `did:template:` prefix and the legacy `did:example:` prefix.
 */
export function isPurchaseOrderTemplate(templateId: string | undefined): boolean {
  if (!templateId) return false;
  return (
    templateId === "did:template:purchase-order-auto-pay-actions-v1" ||
    templateId === "did:example:purchase-order-auto-pay-actions-v1"
  );
}

export function normalizeIssuerEntries(issuer: unknown): string[] {
  if (typeof issuer === "string") {
    return issuer.trim() ? [issuer] : [];
  }
  if (!Array.isArray(issuer)) {
    return [];
  }
  return issuer.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

export function extractIssuerVariableKeys(issuer: unknown): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const entry of normalizeIssuerEntries(issuer)) {
    const match = entry.match(/\$\{variables\.(\w+)/);
    const key = match?.[1];
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

export function resolveIssuerAddresses(
  issuer: unknown,
  ...variableSources: Array<Record<string, unknown> | undefined>
): string[] {
  const seen = new Set<string>();
  const addresses: string[] = [];

  for (const entry of normalizeIssuerEntries(issuer)) {
    if (isAddress(entry)) {
      const normalized = entry.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        addresses.push(entry);
      }
      continue;
    }

    const varKey = entry.match(/\$\{variables\.(\w+)/)?.[1];
    if (!varKey) continue;

    for (const source of variableSources) {
      const value = source?.[varKey];
      if (typeof value === "string" && isAddress(value)) {
        const normalized = value.toLowerCase();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          addresses.push(value);
        }
        break;
      }
    }
  }

  return addresses;
}
