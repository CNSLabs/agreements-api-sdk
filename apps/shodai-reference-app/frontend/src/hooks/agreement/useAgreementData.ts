import * as React from "react";
import { useParams, useSearchParams } from "react-router";
import { resolveStateLabel, isTerminalStateByDfsm, isPurchaseOrderTemplate } from "@/utils/agreementsUi";
import { getBlockExplorerUrlForChain } from "@/utils/chainConfig";
import { useAgreementsApi, type ParticipantApi, type AgreementRecordApi } from "@/hooks/useAgreementsApi";

/**
 * Extract participant entries from agreement variables and their definitions.
 * Used when the API does not return a pre-populated participants list.
 */
function extractParticipantsFromVariables(
  vars: Record<string, unknown>,
  variableDefs: Record<string, any>
): ParticipantApi[] {
  const participantVars: ParticipantApi[] = [];
  Object.entries(variableDefs).forEach(([key, varDef]) => {
    if (varDef?.subType === "participant" && vars[key]) {
      participantVars.push({
        variableKey: key,
        walletAddress: vars[key] as string,
        firstName: varDef?.name ? (varDef.name as string).split(" ")[0] : undefined,
        lastName: varDef?.name ? (varDef.name as string).split(" ").slice(1).join(" ") : undefined,
      });
    }
  });
  return participantVars;
}

/**
 * Format paymentAmount value for display by converting from smallest unit (6 decimals) to human-readable format
 * Only applies to purchase-order-auto-pay-actions template
 */
export function formatPaymentAmount(
  key: string,
  value: unknown,
  templateId: string | undefined
): unknown {
  if (!isPurchaseOrderTemplate(templateId) || key !== "paymentAmount") {
    return value;
  }

  // Convert from smallest unit (e.g., 1000000) to human-readable (e.g., 1.0)
  try {
    let numValue: bigint;
    if (typeof value === "string") {
      // Skip if already looks like a decimal number (might be already formatted)
      if (value.includes(".")) {
        return value;
      }
      numValue = BigInt(value);
    } else if (typeof value === "number") {
      numValue = BigInt(Math.floor(value));
    } else if (typeof value === "bigint") {
      numValue = value;
    } else {
      return value;
    }
    
    const divisor = BigInt(1_000_000);
    const wholePart = numValue / divisor;
    const remainder = numValue % divisor;
    
    if (remainder === BigInt(0)) {
      return wholePart.toString();
    }
    
    // Format with up to 6 decimal places, removing trailing zeros
    const decimalPart = remainder.toString().padStart(6, "0").replace(/0+$/, "");
    return `${wholePart}.${decimalPart}`;
  } catch {
    // If conversion fails, return original value
    return value;
  }
}

export interface UseAgreementDataParams {
  form: {
    reset: (values: Record<string, any>) => void;
  };
}

export function useAgreementData({ form }: UseAgreementDataParams) {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getAgreement, getState, getParticipants } = useAgreementsApi();

  // Core agreement data state
  const [record, setRecord] = React.useState<AgreementRecordApi | null>(null);
  const [currentState, setCurrentState] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [participants, setParticipants] = React.useState<ParticipantApi[]>([]);

  const agreementTemplateIdForQuery = React.useMemo(
    () => (record?.json as any)?.metadata?.templateId || (record?.json as any)?.metadata?.id || null,
    [record?.json]
  );

  // Track the last loaded agreement ID to prevent loops when address changes
  const lastLoadedId = React.useRef<string | null>(null);
  // Track if we've already processed the deployment success modal to prevent flickering
  const hasProcessedDeployModal = React.useRef(false);

  // Use contract address from record if available, otherwise fall back to id (UUID)
  // For API calls, we can use either UUID or address, but for display we prefer address
  const agreementAddress = React.useMemo(() => {
    return record?.address || id || "";
  }, [record?.address, id]);

  const refreshAgreement = React.useCallback(async () => {
    // Use id (UUID) for initial fetch, then record.address for subsequent operations
    const fetchId = id || "";
    if (!fetchId) return;
    const json = (await getAgreement(fetchId)) as AgreementRecordApi;
    
    // Format paymentAmount values once here - all downstream code will use formatted values
    if (json?.variables) {
      const templateId = (json?.json as any)?.metadata?.templateId || (json?.json as any)?.metadata?.id;
      const formattedVariables: Record<string, any> = {};
      Object.entries(json.variables).forEach(([key, value]) => {
        formattedVariables[key] = formatPaymentAmount(key, value, templateId);
      });
      json.variables = formattedVariables;
    }
    
    setRecord(json);
    setLoadError(null);
    if (json?.state) setCurrentState(json.state);
    if (json?.variables) {
      form.reset(json.variables);
    }
    
    // Fetch participants for overview and modal
    if (json.participants && json.participants.length > 0) {
      setParticipants(json.participants);
    } else {
      // Try to get participants from API - use address if available, otherwise UUID
      const participantsId = json.address || fetchId;
      if (participantsId) {
        getParticipants(participantsId)
        .then((res) => {
          if (res?.participants && res.participants.length > 0) {
            setParticipants(res.participants);
          } else {
            const vars = json.variables || {};
            const variableDefs = (json.json as any)?.variables || {};
            const extracted = extractParticipantsFromVariables(vars, variableDefs);
            if (extracted.length > 0) setParticipants(extracted);
          }
        })
        .catch((e: unknown) => {
          console.error("Failed to fetch participants, falling back to variable extraction:", e);
          const vars = json.variables || {};
          const variableDefs = (json.json as any)?.variables || {};
          const extracted = extractParticipantsFromVariables(vars, variableDefs);
          if (extracted.length > 0) setParticipants(extracted);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, form]); // Use id for initial fetch, getAgreement is stable enough

  const refreshState = React.useCallback(async () => {
    // Use id (UUID) for state fetch - it's stable and doesn't change when record loads
    // This prevents the callback from being recreated when record?.address changes
    const stateId = id || "";
    if (!stateId) return;
    const json = await getState(stateId);
    if (json?.state) setCurrentState(json.state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); // Only depend on id, not record?.address, to prevent recreation loops

  // Main effect to load agreement data
  React.useEffect(() => {
    // Use id (UUID) as the dependency, not agreementAddress
    // agreementAddress changes when record loads (UUID -> contract address), which would cause a loop
    // id is stable and only changes when navigating to a different agreement
    const currentId = id || "";
    
    if (!currentId) {
      setRecord(null);
      setCurrentState(null);
      lastLoadedId.current = null;
      return;
    }

    // Only reset state if this is a different agreement (not when address changes)
    const isDifferentAgreement = lastLoadedId.current !== null && lastLoadedId.current !== currentId;
    
    if (isDifferentAgreement) {
      // New agreement - reset everything
      setLoadError(null);
      setRecord(null);
      setCurrentState(null);
      setParticipants([]);
      // Reset the deploy modal flag when agreement ID changes (new agreement loaded)
      hasProcessedDeployModal.current = false;
    }
    
    // Track this ID as loaded (prevents re-running when address changes)
    if (lastLoadedId.current !== currentId) {
      lastLoadedId.current = currentId;
    }

    refreshAgreement().catch((e: any) => setLoadError(e?.message || "Failed to load agreement"));
    refreshState().catch((e: unknown) => console.error("Failed to refresh agreement state:", e));
  }, [id, refreshAgreement, refreshState]);

  // Handle deployment success modal
  React.useEffect(() => {
    const deployed = searchParams.get("deployed");
    // Only process if we haven't already shown the modal and we have both the query param and record
    if (deployed === "true" && record && !hasProcessedDeployModal.current) {
      hasProcessedDeployModal.current = true;
      
      // Remove the query param from URL immediately to prevent re-triggering
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.delete("deployed");
      setSearchParams(newSearchParams, { replace: true });
      
      // Try to fetch participants if available (only if not already set by refreshAgreement)
      if (record.participants && record.participants.length > 0) {
        setParticipants(record.participants);
      } else {
        // Try to get participants from the API (works for Draft agreements)
        // For deployed agreements, participants might be in variables
        const participantsId = record.address || id || "";
        if (participantsId) {
          getParticipants(participantsId)
          .then((res) => {
            if (res?.participants && res.participants.length > 0) {
              setParticipants(res.participants);
            } else {
              const vars = record.variables || {};
              const variableDefs = (record.json as any)?.variables || {};
              const extracted = extractParticipantsFromVariables(vars, variableDefs);
              if (extracted.length > 0) setParticipants(extracted);
            }
          })
          .catch((e: unknown) => {
            console.error("Failed to fetch participants for deploy modal, falling back to variable extraction:", e);
            const vars = record.variables || {};
            const variableDefs = (record.json as any)?.variables || {};
            const extracted = extractParticipantsFromVariables(vars, variableDefs);
            if (extracted.length > 0) setParticipants(extracted);
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, record, record?.address, id, getParticipants]);

  // Derived values
  const agreementJson = React.useMemo(() => record?.json || null, [record]);

  const agreementTemplateId = agreementTemplateIdForQuery;

  const title = String((record as any)?.displayName || (agreementJson as any)?.metadata?.name || "Agreement");

  const stateLabel = currentState
    ? resolveStateLabel({ agreementJson: agreementJson as any, stateId: currentState }) || String(currentState)
    : "—";

  // Check if current state is terminal (no more transitions available)
  const isTerminalState = React.useMemo(() => {
    if (!agreementJson || !currentState) return false;
    return isTerminalStateByDfsm({ agreementJson: agreementJson as any, state: currentState });
  }, [agreementJson, currentState]);

  // Get block explorer URL from persisted agreement chain, not the connected wallet.
  const blockExplorerUrl = React.useMemo(() => {
    return getBlockExplorerUrlForChain(record?.chainId);
  }, [record?.chainId]);

  return {
    // Core data
    record,
    agreementJson,
    currentState,
    participants,
    agreementAddress,
    loadError,

    // Derived values
    title,
    stateLabel,
    isTerminalState,
    blockExplorerUrl,
    agreementTemplateId,

    // Actions
    refreshAgreement,
    refreshState,

    // Refs for external use
    hasProcessedDeployModal,
    setParticipants,
    setLoadError,
    setRecord,
    setCurrentState,
  };
}
