import * as React from "react";
import { createPublicClient, http, keccak256 } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { AgreementEngine, buildInputPayload, inputToBytes32, type AgreementJson } from "@shodai-network/agreements-protocol-evm";
import { useAgreementsApi, type AgreementRecordApi } from "@/hooks/useAgreementsApi";
import type { DocumentVariable } from "@/hooks/documentConfigure/types";
import {
  buildCurrentStateBlankValues,
  buildCurrentStatePayload,
  getCurrentStateFieldKeys,
  normalizeInputDataEntries,
  type NormalizedInputDataEntry,
} from "./currentStateInputValues";
import { getActionSubmitValidationTarget } from "./submitActionValidation";
import {
  formatDiagnosticReport,
  summarizeRecordForDiagnostic,
  summarizeTypedDataForDiagnostic,
  useWalletDiagnostics,
} from "@/hooks/useWalletDiagnostics";
import { extractIssuerVariableKeys, resolveIssuerAddresses } from "@/utils/agreementsUi";
import { getChainConfig } from "@/utils/chainConfig";

async function switchWalletToAgreementChain(
  switchChainAsync: ((args: { chainId: number }) => Promise<unknown>) | undefined,
  chainId: number,
): Promise<void> {
  const chainConfig = getChainConfig(chainId);
  if (!switchChainAsync) {
    throw new Error(`Wallet chain switching is unavailable. Please switch your wallet to ${chainConfig.chainName} (${chainId}) manually.`);
  }
  try {
    await switchChainAsync({ chainId });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : String(error);
    throw new Error(`Unable to switch wallet to ${chainConfig.chainName} (${chainId}): ${message}`);
  }
}

export interface UseAgreementInputsParams {
  agreementJson: any;
  currentState: string | null;
  record: AgreementRecordApi | null;
  form: {
    getValues: () => Record<string, any>;
    reset: (values: Record<string, any>) => void;
    trigger: (name?: string | string[]) => Promise<boolean>;
  };
  variables: Record<string, DocumentVariable>;
  refreshAgreement: () => Promise<void>;
  refreshState: () => Promise<void>;
  refreshInputs: () => Promise<void>;
}

export function useAgreementInputs({
  agreementJson,
  currentState,
  record,
  form,
  refreshAgreement,
  refreshState,
  refreshInputs,
}: UseAgreementInputsParams) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { processInput } = useAgreementsApi();
  const captureDiagnostic = useWalletDiagnostics();

  const [activeInputId, setActiveInputId] = React.useState<string | null>(null);
  const [isWorking, setIsWorking] = React.useState(false);
  const [isActionConfirmOpen, setIsActionConfirmOpen] = React.useState(false);
  const [showActionSuccessModal, setShowActionSuccessModal] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [actionErrorReport, setActionErrorReport] = React.useState<string | null>(null);
  const [lastSubmittedAction, setLastSubmittedAction] = React.useState<{
    inputDisplayName: string;
    payload: Record<string, unknown>;
    txHash: string;
    inputDef?: { data?: Record<string, unknown> };
  } | null>(null);
  const actionSubmitInProgressRef = React.useRef(false);

  const resolveInputIssuerAddresses = React.useCallback(
    (issuer: unknown): string[] =>
      resolveIssuerAddresses(
        issuer,
        record?.variables as Record<string, unknown> | undefined,
        form.getValues() as Record<string, unknown>,
      ),
    [form, record?.variables],
  );

  const availableInputIds = React.useMemo(() => {
    if (!agreementJson || !currentState) return [];
    const transitions = (agreementJson as any)?.execution?.transitions || [];
    const ids: string[] = [];
    for (const t of transitions) {
      if (t?.from === currentState) {
        const inputName = t?.conditions?.[0]?.input;
        if (inputName && !ids.includes(inputName)) ids.push(inputName);
      }
    }
    return ids;
  }, [agreementJson, currentState]);

  const performableInputIds = React.useMemo(() => {
    if (!address || !agreementJson || availableInputIds.length === 0) return [];
    const inputs = (agreementJson as any)?.execution?.inputs || {};
    const ids: string[] = [];
    for (const inputId of availableInputIds) {
      const inputDef = inputs[inputId];
      if (!inputDef) continue;

      const issuerAddrs = resolveInputIssuerAddresses(inputDef.issuer);
      if (issuerAddrs.some((issuerAddr) => issuerAddr.toLowerCase() === address.toLowerCase())) {
        ids.push(inputId);
      }
    }
    return ids;
  }, [address, agreementJson, availableInputIds, resolveInputIssuerAddresses]);

  const nonPerformableInputIds = React.useMemo(
    () => availableInputIds.filter((inputId) => !performableInputIds.includes(inputId)),
    [availableInputIds, performableInputIds]
  );

  // Check if the current user can submit any of the available inputs
  const canSubmitAnyAvailableInput = performableInputIds.length > 0;

  const activeInputDef = React.useMemo(() => {
    if (!agreementJson || !activeInputId) return null;
    return (agreementJson as any)?.execution?.inputs?.[activeInputId] ?? null;
  }, [activeInputId, agreementJson]);

  const activeInputBlankValues = React.useMemo(
    () =>
      buildCurrentStateBlankValues(
        (activeInputDef?.data || {}) as Record<string, unknown>,
        ((agreementJson as any)?.variables || {}) as Record<string, DocumentVariable>,
      ),
    [activeInputDef, agreementJson],
  );

  const activeIssuerAddrs = React.useMemo(() => {
    if (!activeInputDef) return undefined;
    return resolveInputIssuerAddresses(activeInputDef.issuer);
  }, [activeInputDef, resolveInputIssuerAddresses]);

  const activeIssuerAddr = React.useMemo(() => {
    if (!activeIssuerAddrs || activeIssuerAddrs.length === 0) return undefined;
    const matchingIssuer = address
      ? activeIssuerAddrs.find((issuerAddr) => issuerAddr.toLowerCase() === address.toLowerCase())
      : undefined;
    return matchingIssuer ?? activeIssuerAddrs[0];
  }, [activeIssuerAddrs, address]);

  const activeIssuerVarName = React.useMemo(() => {
    const issuerVarNames = extractIssuerVariableKeys(activeInputDef?.issuer);
    return issuerVarNames[0];
  }, [activeInputDef]);

  const canSignActiveInput = React.useMemo(() => {
    if (!activeInputId) return false;
    if (!address) return false;
    if (!activeIssuerAddrs || activeIssuerAddrs.length === 0) return false;
    return activeIssuerAddrs.some((issuerAddr) => issuerAddr.toLowerCase() === address.toLowerCase());
  }, [activeInputId, activeIssuerAddrs, address]);

  // Never auto-select an action; only preserve an explicit user choice when it remains valid.
  React.useEffect(() => {
    if (availableInputIds.length === 0) {
      setActiveInputId(null);
      return;
    }
    if (performableInputIds.length === 0) {
      setActiveInputId(null);
      return;
    }
    if (activeInputId && !performableInputIds.includes(activeInputId)) {
      setActiveInputId(null);
    }
  }, [activeInputId, availableInputIds.length, performableInputIds]);

  const nextActions = React.useMemo(() => {
    if (!agreementJson || !activeInputId) return [];
    if (!activeInputDef) return [];
    return [
      {
        conditions: [
          {
            input: {
              ...activeInputDef,
              issuer: activeIssuerAddrs,
            },
          },
        ],
      },
    ];
  }, [activeInputId, activeInputDef, activeIssuerAddrs, agreementJson]);

  // Compute previous and next states for the Actions & Inputs widget
  const initialState = React.useMemo(
    () => (agreementJson as any)?.execution?.initialState || null,
    [agreementJson]
  );

  const previousStateId = React.useMemo(() => {
    if (!agreementJson || !currentState) return null;
    const transitions = (agreementJson as any)?.execution?.transitions || [];
    for (const t of transitions) {
      if (t?.to === currentState) {
        return t.from || null;
      }
    }
    return null;
  }, [agreementJson, currentState]);

  const { formFieldKeys: formFieldsForActiveInput, requiredFieldKeys: requiredFieldsForActiveInput } = React.useMemo(() => {
    if (!agreementJson || !activeInputId) {
      return {
        formFieldKeys: [],
        requiredFieldKeys: [],
      };
    }
    const inputDef = (agreementJson as any)?.execution?.inputs?.[activeInputId];
    return getCurrentStateFieldKeys(
      (inputDef?.data || {}) as Record<string, unknown>,
      ((agreementJson as any)?.variables || {}) as Record<string, DocumentVariable>,
    );
  }, [agreementJson, activeInputId]);

  React.useEffect(() => {
    form.reset(activeInputBlankValues);
  }, [activeInputBlankValues, form]);

  const handleSubmitActiveInput = React.useCallback(async () => {
    let submitStage = "initial";
    let diagnosticContext: Record<string, unknown> = {
      agreementId: record?.id ?? null,
      agreementAddress: record?.address ?? null,
      agreementStatus: record?.status ?? null,
      currentState,
      inputId: activeInputId,
      connectedAddress: address ?? null,
      hasWalletClient: !!walletClient,
      hasPublicClient: !!publicClient,
      walletClientAccount: (walletClient as any)?.account?.address ?? null,
      walletClientChainId: (walletClient as any)?.chain?.id ?? null,
      publicClientChainId: publicClient?.chain?.id ?? null,
    };

    setIsWorking(true);
    actionSubmitInProgressRef.current = true;
    setActionError(null);
    setActionErrorReport(null);

    try {
      if (!agreementJson || !activeInputId) throw new Error("No active agreement input is available");
      if (!publicClient || !walletClient || !address) throw new Error("Wallet connection is not ready");

      submitStage = "load-input-definition";
      const inputDef = (agreementJson as any)?.execution?.inputs?.[activeInputId];
      if (!inputDef) throw new Error("Input definition not found");
      diagnosticContext = {
        ...diagnosticContext,
        inputDisplayName: inputDef?.displayName ?? activeInputId,
      };

      submitStage = "resolve-issuer";
      const issuerAddrs = resolveInputIssuerAddresses(inputDef.issuer);
      if (!issuerAddrs.some((issuerAddr) => issuerAddr.toLowerCase() === address.toLowerCase())) {
        throw new Error("Connected wallet is not authorized to submit this input");
      }
      diagnosticContext = {
        ...diagnosticContext,
        issuerAddressesResolved: issuerAddrs,
        issuerSource: inputDef.issuer ?? null,
      };

      submitStage = "build-input-payload";
      const formValues = form.getValues();
      const variableDefinitions = ((agreementJson as any)?.variables || {}) as Record<string, DocumentVariable>;
      const inputEntries = normalizeInputDataEntries(
        (inputDef.data || {}) as Record<string, unknown>,
        variableDefinitions,
      );
      const payload = buildCurrentStatePayload(
        (inputDef.data || {}) as Record<string, unknown>,
        formValues,
        variableDefinitions,
      );

      const agreementAddress = record?.address;
      if (!agreementAddress) throw new Error("Agreement address not found");
      const agreementId = record?.id;
      if (!agreementId) throw new Error("Agreement id not found");
      const payloadHex = buildInputPayload(agreementJson as AgreementJson, activeInputId, payload);
      const chainId = record?.chainId;
      if (!chainId) throw new Error("Agreement is missing a chain id");
      const selectedChain = getChainConfig(chainId);
      const currentChainId = await publicClient.getChainId();
      if (currentChainId !== chainId) {
        await switchWalletToAgreementChain(switchChainAsync, chainId);
      }
      const targetPublicClient = currentChainId === chainId
        ? publicClient
        : createPublicClient({
            chain: selectedChain.chain,
            transport: http(selectedChain.rpcUrl),
          });
      diagnosticContext = {
        ...diagnosticContext,
        signingIntent: "submit-input-with-permit",
        inputDefinition: {
          requiredFieldKeys: inputEntries
            .filter(
              (entry): entry is Extract<NormalizedInputDataEntry, { kind: "form" }> =>
                entry.kind === "form" && entry.required
            )
            .map((entry) => entry.formKey),
          submittedFieldKeys: Object.keys(payload),
          payloadFieldSummary: summarizeRecordForDiagnostic(payload),
          payloadByteLength: (payloadHex.length - 2) / 2,
          payloadHash: keccak256(payloadHex),
        },
      };

      submitStage = "build-typed-data";
      const engine = new AgreementEngine(
        agreementAddress as `0x${string}`,
        targetPublicClient as any,
        walletClient as any
      );
      const deadline = Math.floor(Date.now() / 1000) + 60 * 60;
      const nonce = await engine.getNonce(address as `0x${string}`);
      const domain = {
        name: "AgreementEngine",
        version: "1",
        chainId,
        verifyingContract: agreementAddress,
      } as const;
      const types = {
        EIP712Domain: [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ],
        PermitInput: [
          { name: "inputId", type: "bytes32" },
          { name: "payload", type: "bytes" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      } as const;
      const message = {
        inputId: inputToBytes32(activeInputId),
        payload: payloadHex,
        nonce: Number(nonce),
        deadline,
      } as const;
      diagnosticContext = {
        ...diagnosticContext,
        signingAttempt: summarizeTypedDataForDiagnostic({
          domain,
          primaryType: "PermitInput",
          types,
          message: message as unknown as Record<string, unknown>,
        }),
      };

      submitStage = "sign-input-permit";
      const { signature, signerAddress } = await engine.createPermitSignature(
        walletClient as any,
        agreementJson as any,
        activeInputId,
        payload,
        deadline
      );
      diagnosticContext = {
        ...diagnosticContext,
        signatureResult: {
          signerAddress,
          deadline,
          signatureShape: {
            byteLength: (signature.length - 2) / 2,
            preview: `${signature.slice(0, 12)}...${signature.slice(-8)}`,
          },
        },
      };

      submitStage = "submit-input-via-api";
      const inputRecord = await processInput(agreementId, {
        inputId: activeInputId,
        values: payload,
        signer: signerAddress,
        deadline,
        signature,
      });

      // Refresh state and inputs after successful submission
      submitStage = "refresh-agreement-state";
      const refreshResults = await Promise.allSettled([refreshAgreement(), refreshState(), refreshInputs()]);
      const refreshFailures = refreshResults.filter((result) => result.status === "rejected");
      if (refreshFailures.length > 0) {
        console.warn("Submitted input succeeded, but post-submit refresh failed:", refreshFailures);
      }

      return inputRecord;
    } catch (error: any) {
      const diagnosticReport = captureDiagnostic({
        flow: "agreement-input-submit",
        stage: submitStage,
        context: diagnosticContext,
        error,
      });
      if (error && typeof error === "object") {
        (error as any).__diagnosticId = diagnosticReport.id;
      }
      setActionErrorReport(formatDiagnosticReport(diagnosticReport));
      console.error("Failed to submit input:", error);
      throw error;
      // Submit errors are surfaced via canSignActiveInput / disabled state
    } finally {
      setIsWorking(false);
      actionSubmitInProgressRef.current = false;
    }
  }, [
    agreementJson,
    activeInputId,
    address,
    captureDiagnostic,
    currentState,
    form,
    processInput,
    publicClient,
    record?.address,
    record?.chainId,
    record?.id,
    record?.status,
    refreshAgreement,
    refreshInputs,
    refreshState,
    resolveInputIssuerAddresses,
    switchChainAsync,
    walletClient,
  ]);

  const handleClickSubmitAction = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!activeInputId || !canSignActiveInput || !walletClient || !publicClient) return;
    const validationTarget = getActionSubmitValidationTarget(formFieldsForActiveInput);
    if (!validationTarget) {
      setIsActionConfirmOpen(true);
      return;
    }

    void (async () => {
      const isValid = await form.trigger(validationTarget);
      if (!isValid) return;
      setIsActionConfirmOpen(true);
    })();
  }, [activeInputId, canSignActiveInput, publicClient, walletClient, formFieldsForActiveInput, form]);

  const handleActionConfirmSubmit = React.useCallback(async () => {
    actionSubmitInProgressRef.current = true;
    try {
      const inputRecord = await handleSubmitActiveInput();
      setIsActionConfirmOpen(false);
      if (inputRecord && activeInputDef) {
        setLastSubmittedAction({
          inputDisplayName: activeInputDef.displayName || activeInputId || "Action",
          payload: inputRecord.values || {},
          txHash: inputRecord.txHash || "",
          inputDef: activeInputDef,
        });
        setShowActionSuccessModal(true);
      }
    } catch (error: any) {
      console.error("Action submission failed:", error);
      const baseMessage = error?.message || "Action submission failed. Please try again.";
      const referenceId = error?.__diagnosticId ? ` Reference: ${error.__diagnosticId}` : "";
      setActionError(`${baseMessage}${referenceId}`);
      setIsActionConfirmOpen(false);
    }
  }, [activeInputDef, activeInputId, handleSubmitActiveInput]);

  const handleActionDialogChange = React.useCallback((open: boolean) => {
    if (isWorking || actionSubmitInProgressRef.current) return;
    setIsActionConfirmOpen(open);
  }, [isWorking]);

  return {
    // State
    activeInputId,
    isWorking,
    isActionConfirmOpen,
    showActionSuccessModal,
    lastSubmittedAction,
    actionError,
    actionErrorReport,

    // Computed values
    availableInputIds,
    performableInputIds,
    nonPerformableInputIds,
    canSubmitAnyAvailableInput,
    activeInputDef,
    activeIssuerAddr,
    activeIssuerVarName,
    canSignActiveInput,
    nextActions,
    initialState,
    previousStateId,
    formFieldsForActiveInput,
    requiredFieldsForActiveInput,

    // Actions
    setActiveInputId,
    setShowActionSuccessModal,
    setLastSubmittedAction,
    setActionError,
    setActionErrorReport,
    handleClickSubmitAction,
    handleActionConfirmSubmit,
    handleActionDialogChange,

    // Refs
    actionSubmitInProgressRef,
  };
}
