export function normalizeEmail(value: string | undefined): string {
  return String(value || '').trim().toLowerCase();
}

export function normalizeAddress(value: string | undefined): string {
  const raw = String(value || '').trim();
  return /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw.toLowerCase() : '';
}

export function formatOnChainAgreementRef(chainId: unknown, address: unknown): string | undefined {
  const normalizedAddress = normalizeAddress(String(address || ''));
  const normalizedChainId = Number(chainId);
  if (!normalizedAddress || !Number.isSafeInteger(normalizedChainId) || normalizedChainId <= 0) return undefined;
  return `eip155:${normalizedChainId}:${normalizedAddress}`;
}

export function getTemplateId(agreement: any): string | null {
  return agreement?.metadata?.templateId || agreement?.metadata?.id || null;
}

export function getParticipantVariableKeys(agreement: any): string[] {
  return Object.entries(agreement?.variables || {})
    .filter(([, value]: [string, any]) => value?.type === 'address' && (value.subType === 'participant' || value.subtype === 'participant'))
    .map(([key]) => key);
}

export function initialState(agreement: any): string | undefined {
  return agreement?.execution?.initialState || Object.keys(agreement?.execution?.states || {})[0] || undefined;
}

export function nextState(agreement: any, currentState: string | undefined, inputId: string): string | undefined {
  const states = agreement?.execution?.states || {};
  const stateId = currentState || initialState(agreement);
  const current = stateId ? states[stateId] || {} : {};
  const transitions = current.transitions || current.on || [];
  if (Array.isArray(transitions)) {
    return transitions.find((entry) => entry.input === inputId || entry.on === inputId)?.to;
  }
  const nestedMatch = transitions[inputId];
  if (nestedMatch) return nestedMatch;
  const topLevelTransitions = agreement?.execution?.transitions || [];
  if (Array.isArray(topLevelTransitions)) {
    const state = currentState || initialState(agreement);
    return topLevelTransitions.find((entry) => {
      if (entry?.from !== state) return false;
      if (entry?.input === inputId || entry?.on === inputId) return true;
      return (entry?.conditions || []).some((condition) => condition?.input === inputId);
    })?.to;
  }
  return undefined;
}

function normalizeIssuerEntries(issuer: unknown): string[] {
  if (typeof issuer === 'string') return issuer.trim() ? [issuer] : [];
  if (!Array.isArray(issuer)) return [];
  return issuer.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

/**
 * Resolve an input definition's `issuer` entries to wallet addresses. Entries
 * are either literal addresses or `${variables.key}` references, resolved
 * against the given variable sources in order (first source with a valid
 * address wins per entry). Mirrors the frontend's resolveIssuerAddresses in
 * frontend/src/utils/agreementsUi.ts — keep the two in sync.
 *
 * Returns normalized lowercase addresses; entries that resolve to nothing are
 * dropped, so an empty result means the issuer is unknown, not that no one may
 * sign.
 */
export function resolveInputIssuerAddresses(
  issuer: unknown,
  ...variableSources: Array<Record<string, unknown> | undefined>
): string[] {
  const addresses = new Set<string>();
  for (const entry of normalizeIssuerEntries(issuer)) {
    const literal = normalizeAddress(entry);
    if (literal) {
      addresses.add(literal);
      continue;
    }
    const varKey = entry.match(/\$\{variables\.(\w+)/)?.[1];
    if (!varKey) continue;
    for (const source of variableSources) {
      const value = source?.[varKey];
      const resolved = typeof value === 'string' ? normalizeAddress(value) : '';
      if (resolved) {
        addresses.add(resolved);
        break;
      }
    }
  }
  return [...addresses];
}

export function normalizeEmailList(values: unknown): string[] {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeEmail(String(value || ''))).filter(Boolean))];
}

export function refreshDerivedFields(agreement: any, additional: string[] = []) {
  const normalizedStoredAddress = normalizeAddress(agreement.address);
  if (normalizedStoredAddress) agreement.address = normalizedStoredAddress;
  const contributors = new Set([normalizeAddress(agreement.owner), ...additional.map(normalizeAddress)].filter(Boolean));
  for (const value of Object.values(agreement.variables || {})) {
    if (typeof value === 'string' && value.toLowerCase().startsWith('0x')) contributors.add(normalizeAddress(value));
  }
  for (const participant of agreement.participants || []) {
    if (participant.walletAddress) contributors.add(normalizeAddress(participant.walletAddress));
  }
  agreement.contributors = [...contributors];
  const onChainRef = formatOnChainAgreementRef(agreement.chainId, agreement.address);
  if (onChainRef) {
    agreement.onChainRef = onChainRef;
  } else {
    delete agreement.onChainRef;
  }
}
