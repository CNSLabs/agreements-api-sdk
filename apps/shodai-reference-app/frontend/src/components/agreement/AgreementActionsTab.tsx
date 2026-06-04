import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Controller, Control, FieldErrors } from "react-hook-form";
import { createPublicClient, formatUnits, http, isAddress, keccak256, stringToHex } from "viem";
import { Button } from "@/subframe/components/Button";
import { Loader } from "@/subframe/components/Loader";
import { VariableField } from "@/components/VariableField";
import { createValidationRules } from "@/components/variableValidation";
import { IconButton } from "@/subframe/components/IconButton";
import { RadioCardGroup } from "@/subframe/components/RadioCardGroup";
import { Badge } from "@/subframe/components/Badge";
import { Avatar } from "@/subframe/components/Avatar";
import { Tooltip } from "@/subframe/components/Tooltip";
import { IconWithBackground } from "@/subframe/components/IconWithBackground";
import { Accordion } from "@/subframe/components/Accordion";
import { DisplayCard } from "@/subframe/components/DisplayCard";
import { TextArea } from "@/subframe/components/TextArea";
import { ConfirmFlowDialog } from "@/components/ConfirmFlowDialog";
import { DiagnosticReportPanel } from "@/components/DiagnosticReportPanel";
import { InvoiceCsvField } from "@/components/InvoiceCsvField";
import { validateInvoiceCsvValue } from "@/components/invoiceCsvLogic";
import { SuccessDialog } from "@/components/SuccessDialog";
import {
  formatDiagnosticReport,
  summarizeRecordForDiagnostic,
  summarizeTypedDataForDiagnostic,
  useWalletDiagnostics,
} from "@/hooks/useWalletDiagnostics";
import { getActionSummaryFieldPresentation } from "@/components/agreement/actionSummaryFieldPresentation";
import {
  formatRetainerBalanceDisplay,
  getRetainerBalanceLookup,
  resolveRetainerBalanceRpcUrl,
} from "@/components/agreement/retainerBalancePresentation";
import { AgreementVariableRow } from "./AgreementVariableRow";
import { ReadOnlyLongText } from "./readOnlyLongText";
import { isReadOnlyLongTextVariable } from "./readOnlyLongTextLogic";
import { resolveSummaryVariableDefinition } from "./summaryVariableDefinition";
import type { ParticipantApi, AgreementRecordApi } from "@/hooks/useAgreementsApi";
import type { AgreementInputRecordApi } from "@/hooks/useAgreementsApi";
import { extractIssuerVariableKeys, resolveIssuerAddresses } from "@/utils/agreementsUi";
import { getChainConfig, getDefaultChainConfig } from "@/utils/chainConfig";
import { formatOnchainReferenceValue } from "@/utils/onchainReferences";
import {
  FeatherAlertTriangle,
  FeatherBlocks,
  FeatherCheck,
  FeatherEye,
  FeatherExternalLink,
  FeatherFileInput,
  FeatherFormInput,
  FeatherMousePointerClick,
  FeatherStepBack,
  FeatherArrowLeft,
  FeatherFileCheck,
  FeatherX,
} from "@subframe/core";
import * as SubframeCore from "@subframe/core";

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

function formatBalanceNumber(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  const [wholePartRaw, fractionalPartRaw = ""] = normalized.split(".");
  const wholePart = wholePartRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const trimmedFraction = fractionalPartRaw.replace(/0+$/, "").slice(0, 6);
  return trimmedFraction ? `${wholePart}.${trimmedFraction}` : wholePart;
}

function shortAddress(addr: string): string {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function toDatetimeLocal(value: unknown): string {
  if (typeof value !== "string") return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function VisibilityToggleIcon(props: { visible: boolean }) {
  const { visible } = props;
  if (visible) {
    return <FeatherEye />;
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path d="M2 2l20 20" />
      <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
      <path d="M9.4 5.1A10.9 10.9 0 0 1 12 4.8c5 0 9.3 3 11 7.2a11.8 11.8 0 0 1-3.2 4.6" />
      <path d="M6.2 6.3A12 12 0 0 0 1 12c1.7 4.2 6 7.2 11 7.2 1.6 0 3.2-.3 4.6-.9" />
      <path d="M14.1 14.2A3.5 3.5 0 0 1 9.8 9.9" />
    </svg>
  );
}

function getActionFieldValidationRules(
  fieldKey: string,
  variable: DocumentVariable,
): Record<string, unknown> {
  const baseRules = createValidationRules(variable);
  const isInvoiceCsv =
    variable.type === "string" && String((variable as any)?.subType || "").toLowerCase() === "invoice-csv";

  if (!isInvoiceCsv) return baseRules;

  return {
    ...baseRules,
    validate: (value: string) => {
      const baseResult = baseRules.validate(value);
      if (baseResult !== true) return baseResult;
      if (!String(value ?? "").trim()) return true;
      return validateInvoiceCsvValue(String(value ?? ""), variable?.name || fieldKey);
    },
  };
}

interface DocumentVariable {
  type?: string;
  subType?: string;
  name?: string;
  description?: string;
  validation?: Record<string, unknown>;
}

interface ActionSummaryValueProps {
  rawValue: unknown;
  displayValue: string;
  variable: DocumentVariable | null | undefined;
  truncateAt?: number;
  className: string;
  linkClassName: string;
}

function ActionSummaryValue(props: ActionSummaryValueProps) {
  const { rawValue, displayValue, variable, truncateAt, className, linkClassName } = props;
  const presentation = getActionSummaryFieldPresentation({
    rawValue,
    displayValue,
    truncateAt,
    variable,
  });

  if (presentation.href) {
    return (
      <a
        href={presentation.href}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        {presentation.displayValue}
      </a>
    );
  }

  if (isReadOnlyLongTextVariable(variable)) {
    const longTextClassName = className.replace(/\btruncate\b/g, "").replace(/\btext-right\b/g, "").trim();
    const longTextButtonClassName = linkClassName.replace(/\btruncate\b/g, "").replace(/\bbreak-all\b/g, "").replace(/\btext-right\b/g, "").trim();

    return (
      <ReadOnlyLongText
        text={displayValue}
        containerClassName="text-left"
        textClassName={`${longTextClassName} whitespace-pre-wrap`.trim()}
        buttonClassName={`ml-1 inline p-0 ${longTextButtonClassName}`.trim()}
      />
    );
  }

  return (
    <span className={`${className} ${presentation.preserveWhitespace ? "whitespace-pre-wrap text-left" : ""}`}>
      {presentation.displayValue}
    </span>
  );
}

export interface AgreementActionsTabProps {
  record: AgreementRecordApi | null;
  agreementJson: any;
  currentState: string | null;
  stateLabel: string;
  previousStateId: string | null;
  previousStateLabel: string | null;
  activityInputs: AgreementInputRecordApi[];
  participants: ParticipantApi[];
  displayParticipants: ParticipantApi[];
  variables: Record<string, DocumentVariable>;
  performableInputIds: string[];
  nonPerformableInputIds: string[];
  activeInputId: string | null;
  activeInputDef: any;
  formFieldsForActiveInput: string[];
  requiredFieldsForActiveInput: string[];
  canSignActiveInput: boolean;
  activeIssuerAddr: string | undefined;
  activeIssuerVarName: string | undefined;
  isTerminalState: boolean;
  blockExplorerUrl: string;
  connectedAddress: string | undefined;
  hasWalletClient: boolean;
  hasPublicClient: boolean;
  form: { getValues: (name?: string) => unknown };
  control: Control<any>;
  errors: FieldErrors;
  setActiveInputId: (id: string | null) => void;
  handleClickSubmitAction: (event: React.MouseEvent<HTMLButtonElement>) => void;
  handleActionConfirmSubmit: () => void;
  handleActionDialogChange: (open: boolean) => void;
  isWorking: boolean;
  isActionConfirmOpen: boolean;
  showActionSuccessModal: boolean;
  lastSubmittedAction: {
    inputDisplayName: string;
    payload: Record<string, unknown>;
    txHash: string;
    inputDef?: { data?: Record<string, unknown> };
  } | null;
  setShowActionSuccessModal: (open: boolean) => void;
  setLastSubmittedAction: (action: any) => void;
  actionError: string | null;
  actionErrorReport: string | null;
  setActionError: (error: string | null) => void;
  setActionErrorReport: (report: string | null) => void;
  openPreviousInputAccordion: boolean;
  onReturnToOverview: () => void;
}

export function AgreementActionsTab(props: AgreementActionsTabProps) {
  const captureDiagnostic = useWalletDiagnostics();
  const {
    record,
    agreementJson,
    currentState,
    stateLabel,
    previousStateId,
    previousStateLabel,
    activityInputs,
    participants,
    displayParticipants,
    variables,
    performableInputIds,
    nonPerformableInputIds,
    activeInputId,
    activeInputDef,
    formFieldsForActiveInput,
    requiredFieldsForActiveInput,
    canSignActiveInput,
    activeIssuerAddr,
    activeIssuerVarName,
    isTerminalState,
    blockExplorerUrl,
    connectedAddress: address,
    hasWalletClient,
    hasPublicClient,
    form,
    control,
    errors,
    setActiveInputId,
    handleClickSubmitAction,
    handleActionConfirmSubmit,
    handleActionDialogChange,
    isWorking,
    isActionConfirmOpen,
    showActionSuccessModal,
    lastSubmittedAction,
    setShowActionSuccessModal,
    setLastSubmittedAction,
    actionError,
    actionErrorReport,
    setActionError,
    setActionErrorReport,
    openPreviousInputAccordion,
    onReturnToOverview,
  } = props;

  const handlePreviewActionError = React.useCallback(() => {
    const previewPayload = Object.fromEntries(
      formFieldsForActiveInput.map((fieldKey) => {
        const value = form.getValues(fieldKey);
        return [fieldKey, value == null || value === "" ? `[preview:${fieldKey}]` : value];
      })
    );
    const previewDeadline = Math.floor(Date.now() / 1000) + 60 * 60;
    const previewInputId = activeInputId || "previewInput";
    const diagnostic = captureDiagnostic({
      flow: "agreement-input-preview",
      stage: "build-typed-data-preview",
      context: {
        agreementId: record?.id ?? null,
        agreementAddress: record?.address ?? null,
        agreementStatus: record?.status ?? null,
        activeInputId,
        currentState,
        canSignActiveInput,
        connectedAddress: address ?? null,
        signingIntent: "submit-input-with-permit",
        inputDefinition: {
          requiredFieldKeys: requiredFieldsForActiveInput,
          submittedFieldKeys: Object.keys(previewPayload),
          payloadFieldSummary: summarizeRecordForDiagnostic(previewPayload),
        },
        signingAttempt: summarizeTypedDataForDiagnostic({
          domain: {
            name: "AgreementEngine",
            version: "1",
            verifyingContract: record?.address ?? "0x0000000000000000000000000000000000000000",
          },
          primaryType: "PermitInput",
          types: {
            PermitInput: [
              { name: "inputId", type: "bytes32" },
              { name: "payload", type: "bytes" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          message: {
            inputId: keccak256(stringToHex(previewInputId)),
            payload: `0x${"12".repeat(24)}`,
            nonce: 0n,
            deadline: BigInt(previewDeadline),
          },
        }),
        previewMode: true,
      },
      error: new Error("Preview action submission error for diagnostics UI."),
    });
    setActionError(`Preview action submission error. Reference: ${diagnostic.id}`);
    setActionErrorReport(formatDiagnosticReport(diagnostic));
  }, [
    activeInputId,
    address,
    canSignActiveInput,
    captureDiagnostic,
    currentState,
    form,
    record?.address,
    record?.status,
    record?.id,
    formFieldsForActiveInput,
    requiredFieldsForActiveInput,
    setActionError,
    setActionErrorReport,
  ]);

  const initialState = (agreementJson as any)?.execution?.initialize?.initialState;
  const [isPreviousInputAccordionOpen, setIsPreviousInputAccordionOpen] = React.useState(openPreviousInputAccordion);
  const [showOtherParticipantActions, setShowOtherParticipantActions] = React.useState(false);
  const totalAvailableInputCount = performableInputIds.length + nonPerformableInputIds.length;
  const visibleInputIds = React.useMemo(
    () =>
      showOtherParticipantActions
        ? [...performableInputIds, ...nonPerformableInputIds]
        : performableInputIds,
    [nonPerformableInputIds, performableInputIds, showOtherParticipantActions]
  );
  const appChainConfig = React.useMemo(() => {
    try {
      return record?.chainId ? getChainConfig(record.chainId) : getDefaultChainConfig();
    } catch {
      return getDefaultChainConfig();
    }
  }, [record?.chainId]);
  const availableCurrentStepInputs = React.useMemo(() => {
    const allInputIds = [...performableInputIds, ...nonPerformableInputIds];
    const inputs = (agreementJson as any)?.execution?.inputs || {};
    return Object.fromEntries(
      allInputIds.map((inputId) => [inputId, inputs[inputId] ?? null]),
    );
  }, [agreementJson, nonPerformableInputIds, performableInputIds]);
  const retainerBalanceLookup = React.useMemo(
    () =>
      getRetainerBalanceLookup({
        availableInputs: availableCurrentStepInputs,
        recordVariables: record?.variables,
      }),
    [availableCurrentStepInputs, record?.variables],
  );
  const retainerBalanceRpcUrl = React.useMemo(() => {
    if (!retainerBalanceLookup) return undefined;

    return resolveRetainerBalanceRpcUrl({
      chainId: retainerBalanceLookup.chainId,
      appChainId: appChainConfig.chainId,
      appRpcUrl: appChainConfig.rpcUrl,
      infuraProjectId: import.meta.env.VITE_INFURA_PROJECT_ID || "",
    });
  }, [appChainConfig.chainId, appChainConfig.rpcUrl, retainerBalanceLookup]);
  const {
    data: retainerBalanceData,
    isLoading: isRetainerBalanceLoading,
    isError: isRetainerBalanceError,
  } = useQuery({
    queryKey: [
      "retainer-balance",
      retainerBalanceLookup?.chainId ?? null,
      retainerBalanceLookup?.retainerAddress ?? null,
      retainerBalanceLookup?.currencyAddress ?? null,
      retainerBalanceRpcUrl ?? null,
    ],
    enabled: !!retainerBalanceLookup && !!retainerBalanceRpcUrl,
    queryFn: async () => {
      if (!retainerBalanceLookup || !retainerBalanceRpcUrl) {
        throw new Error("Retainer balance lookup is unavailable");
      }

      const publicClient = createPublicClient({
        transport: http(retainerBalanceRpcUrl),
      });

      const [balance, decimals, symbol] = await Promise.all([
        publicClient.readContract({
          address: retainerBalanceLookup.currencyAddress,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [retainerBalanceLookup.retainerAddress],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: retainerBalanceLookup.currencyAddress,
          abi: ERC20_BALANCE_ABI,
          functionName: "decimals",
        }) as Promise<number>,
        publicClient
          .readContract({
            address: retainerBalanceLookup.currencyAddress,
            abi: ERC20_BALANCE_ABI,
            functionName: "symbol",
          })
          .then((value) => String(value || "").trim())
          .catch(() => ""),
      ]);

      return {
        formattedBalance: formatBalanceNumber(formatUnits(balance, decimals)),
        tokenSymbol: symbol,
      };
    },
    staleTime: 30_000,
  });
  const retainerBalanceDisplay = React.useMemo(() => {
    if (!retainerBalanceData) return "";
    return formatRetainerBalanceDisplay(retainerBalanceData);
  }, [retainerBalanceData]);

  React.useEffect(() => {
    if (openPreviousInputAccordion) {
      setIsPreviousInputAccordionOpen(true);
    }
  }, [openPreviousInputAccordion]);

  return (
    <>
      <div className="flex w-full max-w-[768px] grow shrink-0 basis-0 flex-col items-center gap-4 overflow-y-auto py-8 relative z-5">
        {isTerminalState ? (
          <div className="flex w-full flex-col items-center gap-6 rounded-md border border-solid border-neutral-border bg-default-background px-6 py-8 shadow-sm">
            <IconWithBackground variant="brand" size="large" icon={<FeatherCheck />} />
            <div className="flex flex-col items-center gap-2">
              <span className="text-heading-1 font-heading-1 text-default-font">Agreement Complete</span>
              <span className="text-body font-body text-subtext-color text-center">
                This agreement has reached a terminal state and no further actions are available.
              </span>
              {stateLabel && (
                <div className="flex items-center gap-2 mt-2">
                  <Badge className="h-7 w-auto flex-none" icon={null} iconRight={null}>
                    Current State: {stateLabel}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {(() => {
              const inInitialState = currentState === initialState;
              const isPrevStepInit = previousStateId === initialState;
              const hasInitVars = record?.variables && Object.keys(record.variables).length > 0;
              const hasPrevInput = activityInputs.length > 0;
              const showInitial = inInitialState && hasInitVars;
              const showPrevious = previousStateLabel && (hasPrevInput || (isPrevStepInit && hasInitVars));
              if (!showInitial && !showPrevious) return null;
              const showInitVarsAsPrev = isPrevStepInit && hasInitVars && !hasPrevInput;
              const values: Record<string, unknown> = showInitial || showInitVarsAsPrev ? record!.variables! : activityInputs[0]?.values ?? {};
              const txHash = showInitial || showInitVarsAsPrev ? "" : activityInputs[0]?.txHash ?? "";
              const createdAt = showInitial || showInitVarsAsPrev ? record?.createdAt : activityInputs[0]?.createdAt;
              const when = createdAt ? new Date(createdAt) : null;
              const whenLabel =
                when && !Number.isNaN(when.getTime())
                  ? (() => {
                      const daysAgo = Math.floor((Date.now() - when.getTime()) / (1000 * 60 * 60 * 24));
                      if (daysAgo === 0) return "Today";
                      if (daysAgo === 1) return "1 day ago";
                      return `${daysAgo} days ago`;
                    })()
                  : createdAt ? String(createdAt) : "";
              let prevSubmitterName = "";
              if (!showInitial && !showInitVarsAsPrev && activityInputs[0]?.inputId) {
                const prevInputDef = (agreementJson as any)?.execution?.inputs?.[activityInputs[0].inputId];
                if (prevInputDef?.issuer) {
                  const issuerNames = extractIssuerVariableKeys(prevInputDef.issuer)
                    .map((issuerVarKey) => {
                      const p = participants.find(pp => pp.variableKey === issuerVarKey);
                      return p ? ([p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || issuerVarKey) : issuerVarKey;
                    })
                    .filter(Boolean);
                  if (issuerNames.length > 0) {
                    prevSubmitterName = issuerNames.join(" or ");
                  }
                }
              }
              const title = showInitial || showInitVarsAsPrev ? "Initial Values" : `Previous Step Summary: ${previousStateLabel}`;
              const subtitle = showInitial || showInitVarsAsPrev
                ? "Variables set at deployment"
                : `Completed by ${prevSubmitterName || "User"} • ${whenLabel}`;
              const previousInputDefinition =
                !showInitial && !showInitVarsAsPrev && activityInputs[0]?.inputId
                  ? (agreementJson as any)?.execution?.inputs?.[activityInputs[0].inputId]
                  : null;
              const previousInputDataDefinitions =
                previousInputDefinition && typeof previousInputDefinition.data === "object" && previousInputDefinition.data !== null
                  ? previousInputDefinition.data
                  : null;
              return (
                <div className="flex w-full flex-col items-start gap-4 rounded-md border border-solid border-neutral-border bg-default-background shadow-sm">
                  <Accordion
                    open={isPreviousInputAccordionOpen}
                    onOpenChange={setIsPreviousInputAccordionOpen}
                    trigger={
                      <div className="flex w-full flex-col items-center gap-3 px-4 py-3">
                        <div className="flex w-full items-center gap-3">
                          <IconWithBackground variant="neutral" size="medium" icon={<FeatherStepBack />} />
                          <div className="flex grow shrink-0 basis-0 flex-col items-start">
                            <span className="text-heading-3 font-heading-3 text-default-font">{title}</span>
                            <span className="text-caption font-caption text-subtext-color">{subtitle}</span>
                          </div>
                          <div className="flex items-center gap-1 px-1 py-1">
                            <Badge variant="neutral">{Object.keys(values).length} {showInitial || showInitVarsAsPrev ? "Variables" : "Inputs"}</Badge>
                          </div>
                          <Accordion.Chevron />
                        </div>
                      </div>
                    }
                  >
                    <div className="flex w-full flex-col items-start gap-4 border-t border-solid border-neutral-border bg-neutral-50 px-4 py-4">
                      <span className="text-caption-bold font-caption-bold text-subtext-color">
                        {showInitial || showInitVarsAsPrev ? "INITIAL VARIABLES" : "SUBMITTED VARIABLES"}
                      </span>
                      {Object.keys(values).length > 0 ? (
                        <div className="flex w-full flex-col items-start gap-px rounded-md border border-solid border-neutral-border bg-neutral-border">
                          {Object.entries(values).map(([key, value]) => {
                            const variable = resolveSummaryVariableDefinition({
                              key,
                              topLevelVariables: variables as Record<string, unknown>,
                              inputDataDefinitions: previousInputDataDefinitions,
                            });
                            const label = variable?.name || key;
                            return <AgreementVariableRow key={key} label={label} value={value} variable={variable} />;
                          })}
                        </div>
                      ) : (
                        <div className="w-full rounded-md bg-neutral-50 px-3 py-2 text-caption font-caption text-subtext-color">No submitted variables</div>
                      )}
                      {txHash && (
                        <div className="flex w-full items-center justify-end gap-2">
                          <span className="text-caption font-caption text-subtext-color">Transaction: {shortAddress(txHash)}</span>
                          <IconButton size="small" icon={<FeatherExternalLink />} onClick={() => { try { window.open(`${blockExplorerUrl}/tx/${txHash}`, "_blank"); } catch (e) { console.error("Failed to open block explorer:", e); } }} />
                        </div>
                      )}
                    </div>
                  </Accordion>
                </div>
              );
            })()}

            <DisplayCard
              title={`Current Step: ${stateLabel || currentState || "—"}`}
              content={
              <div className="flex w-full flex-col items-start gap-4 px-4 py-4">
              <div className="flex h-px w-full flex-none flex-col items-center gap-2 bg-neutral-border" />
              <div className="flex w-full items-center gap-3">
                <IconWithBackground variant="neutral" size="medium" icon={<FeatherFileInput />} square={true} />
                <div className="flex grow shrink-0 basis-0 flex-col items-start">
                  <span className="text-heading-3 font-heading-3 text-default-font">Select Action</span>
                  <span className="whitespace-nowrap text-caption font-caption text-subtext-color">Select the action you wish to take</span>
                  {retainerBalanceLookup ? (
                    isRetainerBalanceLoading ? (
                      <span className="text-caption font-caption text-subtext-color">
                        Loading current onchain retainer balance…
                      </span>
                    ) : !retainerBalanceRpcUrl || isRetainerBalanceError || !retainerBalanceDisplay ? (
                      <span className="text-caption font-caption text-yellow-800">
                        Current onchain retainer balance is unavailable right now.
                      </span>
                    ) : (
                      <span className="text-caption font-caption text-subtext-color">
                        Current onchain retainer balance: {retainerBalanceDisplay}
                      </span>
                    )
                  ) : null}
                </div>
                <SubframeCore.Tooltip.Provider>
                  <SubframeCore.Tooltip.Root>
                    <SubframeCore.Tooltip.Trigger asChild={true}>
                      <span className="inline-flex">
                        <IconButton
                          variant={showOtherParticipantActions ? "brand-primary" : "neutral-secondary"}
                          size="small"
                          icon={<VisibilityToggleIcon visible={showOtherParticipantActions} />}
                          onClick={() => setShowOtherParticipantActions((current) => !current)}
                          disabled={nonPerformableInputIds.length === 0}
                          title={
                            nonPerformableInputIds.length === 0
                              ? "No other actions to show"
                              : showOtherParticipantActions
                                ? "View only your actions"
                                : "Show actions assigned to other participants"
                          }
                        />
                      </span>
                    </SubframeCore.Tooltip.Trigger>
                    <SubframeCore.Tooltip.Portal>
                      <SubframeCore.Tooltip.Content side="left" align="center" sideOffset={8} asChild={true}>
                        <Tooltip>
                          {nonPerformableInputIds.length === 0
                            ? "No other actions to show"
                            : showOtherParticipantActions
                              ? "View only your actions"
                              : "Show actions assigned to other participants"}
                        </Tooltip>
                      </SubframeCore.Tooltip.Content>
                    </SubframeCore.Tooltip.Portal>
                  </SubframeCore.Tooltip.Root>
                </SubframeCore.Tooltip.Provider>
              </div>
              {totalAvailableInputCount > 0 && performableInputIds.length === 0 ? (
                <div className="flex w-full items-start gap-2 rounded-md border border-solid border-warning-300 bg-warning-50 px-4 py-3">
                  <FeatherAlertTriangle className="text-body font-body text-warning-600" />
                  <div className="flex grow shrink-0 basis-0 flex-col items-start gap-1">
                    <span className="text-body-bold font-body-bold text-default-font">
                      {address ? "No actions available for this account" : "Connect a wallet to view eligible actions"}
                    </span>
                    <span className="text-caption font-caption text-subtext-color">
                      {address
                        ? "You are not assigned any of the roles with available actions for this step. Check that you are logged in with the correct account if you believe this is an error."
                        : "Connect a wallet to see which actions you can take for this step. You can still reveal the other available actions with the eye icon."}
                    </span>
                  </div>
                </div>
              ) : null}
              <RadioCardGroup className="h-auto w-full flex-none" value={activeInputId || ""} onValueChange={(value: string) => setActiveInputId(value)}>
                <div className="flex grow shrink-0 basis-0 flex-col items-start gap-2">
                  {visibleInputIds.length === 0 ? (
                    totalAvailableInputCount === 0 ? (
                      <div className="flex w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-neutral-300 bg-neutral-25 px-6 py-8 text-center">
                        <IconWithBackground variant="neutral" size="large" icon={<FeatherMousePointerClick />} />
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-body-bold font-body-bold text-default-font">No actions in this step</span>
                          <span className="max-w-[480px] text-caption font-caption text-subtext-color">
                            This step does not have any available actions yet.
                          </span>
                        </div>
                      </div>
                    ) : null
                  ) : visibleInputIds.map((id) => {
                    const input = (agreementJson as any)?.execution?.inputs?.[id];
                    const label = input?.displayName || id;
                    const description = input?.description || input?.details || "";
                    const issuerVars = extractIssuerVariableKeys(input?.issuer);
                    const issuerAddrs = resolveIssuerAddresses(input?.issuer, record?.variables as Record<string, unknown> | undefined);
                    const displayName = issuerVars.length > 0
                      ? issuerVars.map((issuerVar) => {
                          const participant = displayParticipants.find((p) => p.variableKey === issuerVar);
                          const fullName = participant ? [participant.firstName, participant.lastName].filter(Boolean).join(" ") : "";
                          if (fullName) return fullName;
                          if (participant?.email) return participant.email;
                          const issuerAddr = (record?.variables as Record<string, unknown> | undefined)?.[issuerVar];
                          return typeof issuerAddr === "string" && isAddress(issuerAddr) ? shortAddress(issuerAddr) : `(set ${issuerVar})`;
                        }).join(" or ")
                      : issuerAddrs.length > 0
                        ? issuerAddrs.map((issuerAddr) => shortAddress(issuerAddr)).join(" or ")
                        : "(unknown)";
                    const initial = displayName?.[0]?.toUpperCase() || "?";
                    const isPerformable = performableInputIds.includes(id);
                    const disabled = !isPerformable;
                    const isSelected = id === activeInputId;
                    return (
                      <RadioCardGroup.RadioCard key={id} hideRadio={true} value={id} checked={isSelected} disabled={disabled}>
                        <div className="flex w-full flex-col items-start gap-1 pr-2">
                          <span className="w-full text-body-bold font-body-bold text-default-font">{String(label)}</span>
                          {description ? <span className="w-full text-caption font-caption text-subtext-color">{String(description)}</span> : null}
                          <div className="flex w-full items-center gap-2">
                            <div className="flex items-center gap-1">
                              <Avatar size="x-small">{initial}</Avatar>
                              <div className="flex flex-col items-start">
                                <span className="text-caption-bold font-caption-bold text-default-font">{displayName}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </RadioCardGroup.RadioCard>
                    );
                  })}
                </div>
              </RadioCardGroup>
              <div className="flex h-px w-full flex-none flex-col items-center gap-2 bg-neutral-border" />
              <div className="flex w-full items-center gap-3">
                <IconWithBackground variant="neutral" size="medium" icon={<FeatherFormInput />} square={true} />
                <div className="flex flex-col items-start">
                  <span className="text-heading-3 font-heading-3 text-default-font">Action Inputs</span>
                  <span className="whitespace-nowrap text-caption font-caption text-subtext-color">Complete any required fields and add optional values if needed</span>
                </div>
              </div>
              {!activeInputId ? (
                <div className="flex w-full flex-col items-center justify-center gap-4 rounded-md border border-dashed border-neutral-300 bg-neutral-25 px-6 py-8">
                  <div className="flex flex-col items-center gap-2">
                    <IconWithBackground variant="neutral" size="large" icon={<FeatherMousePointerClick />} />
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-body-bold font-body-bold text-default-font">No action selected</span>
                      <span className="text-caption font-caption text-subtext-color text-center">Please select an action above to continue with your submission</span>
                    </div>
                  </div>
                </div>
              ) : formFieldsForActiveInput.length === 0 ? (
                <div className="flex w-full grow shrink-0 basis-0 flex-col items-center justify-center gap-4 rounded-md bg-neutral-50 px-2 py-2">
                  <span className="text-monospace-body font-monospace-body text-default-font">No Input Variables</span>
                </div>
              ) : (
                <div className="flex w-full flex-col items-start gap-3">
                  {!canSignActiveInput && (
                    <div className="w-full rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                      {activeIssuerAddr ? `This step must be signed by ${shortAddress(activeIssuerAddr)}.` : activeIssuerVarName ? `Signer not known yet. Fill ${activeIssuerVarName} first.` : "Signer not known yet for this step."}
                    </div>
                  )}
                  {formFieldsForActiveInput.map((fieldKey, index) => {
                    let variable = (variables as any)?.[fieldKey];
                    if (!variable && activeInputDef?.data?.[fieldKey]) {
                      const inlineField = activeInputDef.data[fieldKey];
                      if (typeof inlineField === "object" && inlineField !== null && !Array.isArray(inlineField)) {
                        variable = { type: inlineField.type || "string", subType: inlineField.subType, name: inlineField.name || fieldKey, description: inlineField.description, validation: inlineField.validation };
                      }
                    }
                    if (!variable) return null;
                    const isLongText = variable.type === "string" && String((variable as any)?.subType || "").toLowerCase() === "longtext";
                    const isMarkdown = variable.type === "string" && String((variable as any)?.subType || "").toLowerCase() === "markdown";
                    const isInvoiceCsv = variable.type === "string" && String((variable as any)?.subType || "").toLowerCase() === "invoice-csv";
                    if (isLongText || isMarkdown || isInvoiceCsv) {
                      return (
                        <Controller
                          key={fieldKey}
                          control={control}
                          name={fieldKey}
                          rules={getActionFieldValidationRules(fieldKey, variable)}
                          render={({ field }) => (
                            isInvoiceCsv ? (
                              <InvoiceCsvField
                                label={variable.name || fieldKey}
                                description={variable.description || ""}
                                value={String(field.value ?? "")}
                                onChange={field.onChange}
                                onBlur={field.onBlur}
                                error={(errors as any)?.[fieldKey]?.message}
                                disabled={!canSignActiveInput}
                              />
                            ) : (
                              <TextArea className="h-auto w-full flex-none" error={!!(errors as any)?.[fieldKey]} variant="outline" label={variable.name || fieldKey} helpText={variable.description || ""}>
                                <TextArea.Input placeholder={variable.description || "Enter value"} value={field.value ?? ""} onChange={field.onChange} onBlur={field.onBlur} disabled={!canSignActiveInput} autoFocus={index === 0} />
                              </TextArea>
                            )
                          )}
                        />
                      );
                    }
                    return (
                      <Controller
                        key={fieldKey}
                        control={control}
                        name={fieldKey}
                        rules={getActionFieldValidationRules(fieldKey, variable)}
                        render={({ field }) => (
                          <VariableField
                            fieldKey={fieldKey}
                            variable={variable}
                            value={field.value ?? ""}
                            onChange={(value) => field.onChange(value)}
                            onBlur={field.onBlur}
                            error={(errors as any)?.[fieldKey]}
                            disabled={!canSignActiveInput}
                            showError={true}
                            convertDateTime={toDatetimeLocal}
                            useTextArea={false}
                            autoFocus={index === 0}
                          />
                        )}
                      />
                    );
                  })}
                </div>
              )}
              <div className="flex h-px w-full flex-none flex-col items-center gap-2 bg-neutral-border" />
              <Button
                className="h-10 w-full flex-none"
                variant="brand-primary"
                size="large"
                icon={isWorking ? <Loader size="small" /> : <FeatherBlocks />}
                onClick={handleClickSubmitAction}
                disabled={!activeInputId || !hasWalletClient || !hasPublicClient || isWorking || !canSignActiveInput}
              >
                SIGN &amp; SUBMIT
              </Button>
              {import.meta.env.DEV ? (
                <Button
                  className="h-10 w-full flex-none"
                  variant="neutral-secondary"
                  size="large"
                  onClick={handlePreviewActionError}
                >
                  Preview Error Dialog
                </Button>
              ) : null}
            </div>
            }
          />
          </>
        )}
      </div>

      <ConfirmFlowDialog
        open={isActionConfirmOpen || isWorking}
        onOpenChange={handleActionDialogChange}
        isWorking={isWorking}
        title="Confirm Action"
        progressTitle="Submitting Action"
        progressMessage={"Your signed input is being submitted to the blockchain.\nThis may take a few moments."}
        widthClassName="w-[640px] max-w-full"
        footer={
          <>
            <Button variant="neutral-secondary" size="large" onClick={() => handleActionDialogChange(false)} disabled={isWorking}>Cancel</Button>
            <Button variant="brand-primary" size="large" icon={<FeatherBlocks />} onClick={() => void handleActionConfirmSubmit()} disabled={isWorking || !canSignActiveInput}>Sign &amp; Submit</Button>
          </>
        }
      >
        {formFieldsForActiveInput.length > 0 ? (
          <DisplayCard
            icon={<FeatherFormInput />}
            title="Values to Submit"
            content={
            <div className="flex w-full flex-col items-start gap-2 px-4 py-4">
              {formFieldsForActiveInput.map((fieldKey) => {
                const variable = (variables as any)?.[fieldKey] ?? activeInputDef?.data?.[fieldKey];
                const label = typeof variable === "object" && variable?.name ? variable.name : fieldKey;
                const isLongText = typeof variable === "object" && variable?.type === "string" && String((variable as any)?.subType || "").toLowerCase() === "longtext";
                const rawValue = form.getValues(fieldKey);
                let display: string;
                if (typeof variable === "object" && variable?.subType && typeof rawValue === "string") {
                  display = formatOnchainReferenceValue(rawValue, variable, { mode: "inline" });
                } else if (typeof rawValue === "string") {
                  display = !isLongText && rawValue.length > 80 ? `${rawValue.slice(0, 80)}…` : rawValue;
                } else if (rawValue === null || rawValue === undefined) {
                  display = "(empty)";
                } else {
                  display = String(rawValue);
                }
                return (
                  <div key={fieldKey} className="flex w-full min-w-0 items-start justify-between gap-3 rounded-md bg-neutral-50 px-3 py-2">
                    <span className="text-caption font-caption text-subtext-color">{label}</span>
                    <div className="min-w-0 max-w-[60%]">
                      <ActionSummaryValue
                        rawValue={rawValue}
                        displayValue={display}
                        variable={variable}
                        truncateAt={80}
                        className={`block text-caption font-caption text-default-font break-words ${isLongText ? "" : "truncate text-right"}`}
                        linkClassName="block truncate text-right text-caption font-caption text-brand-700 hover:underline"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            }
          />
        ) : (
          <div className="text-body font-body text-subtext-color">No values to submit for this action.</div>
        )}
      </ConfirmFlowDialog>

      <SuccessDialog
        open={showActionSuccessModal}
        onOpenChange={(open) => { if (!open) { setShowActionSuccessModal(false); setLastSubmittedAction(null); } }}
        title="Action Submitted"
        message={<>Your {lastSubmittedAction?.inputDisplayName || "action"} input has been successfully signed and submitted.</>}
        footer={
          <Button variant="brand-primary" size="large" icon={<FeatherArrowLeft />} onClick={onReturnToOverview}>Return to Agreement</Button>
        }
      >
        {lastSubmittedAction && Object.keys(lastSubmittedAction.payload).length > 0 && (
          <DisplayCard
            icon={<FeatherFileInput />}
            title="Input Summary"
            content={
            <div className="flex w-full flex-col items-start gap-3 px-4 py-4">
              <div className="flex w-full items-start gap-2">
                <div className="w-24 flex-none break-words text-left text-caption font-caption text-subtext-color">
                  Action Type
                </div>
                <Badge variant="brand">{lastSubmittedAction.inputDisplayName}</Badge>
              </div>
              {Object.entries(lastSubmittedAction.payload).map(([k, v]) => {
                const inlineField = lastSubmittedAction.inputDef?.data?.[k];
                const variable = (variables as any)?.[k] || (typeof inlineField === "object" && inlineField !== null ? inlineField : null);
                const label = variable?.name || k;
                const display = v === null || v === undefined
                  ? "(empty)"
                  : formatOnchainReferenceValue(v, variable, { mode: "inline" });
                return (
                  <div key={k} className="flex w-full min-w-0 items-start gap-2">
                    <div className="w-24 flex-none break-words text-left text-caption font-caption text-subtext-color">
                      {label}
                    </div>
                    <div className="min-w-0 grow shrink basis-0">
                      <ActionSummaryValue
                        rawValue={v}
                        displayValue={display}
                        variable={variable}
                        className="block text-body font-body text-default-font break-words"
                        linkClassName="block break-all text-body font-body text-brand-700 hover:underline"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            }
          />
        )}
        {lastSubmittedAction?.txHash && (
          <div
            className="flex w-full items-center justify-between rounded-md bg-neutral-50 px-4 py-3 cursor-pointer hover:bg-neutral-100"
            onClick={() => { try { window.open(`${blockExplorerUrl}/tx/${lastSubmittedAction?.txHash}`, "_blank"); } catch (e) { console.error("Failed to open block explorer:", e); } }}
          >
            <div className="flex items-center gap-2">
              <FeatherFileCheck className="text-caption font-caption text-subtext-color" />
              <span className="text-caption font-caption text-subtext-color">Transaction: {shortAddress(lastSubmittedAction.txHash)}</span>
            </div>
            <FeatherExternalLink className="text-caption font-caption text-subtext-color" />
          </div>
        )}
      </SuccessDialog>

      <SuccessDialog
        open={!!actionError}
        onOpenChange={(open) => {
          if (!open) {
            setActionError(null);
            setActionErrorReport(null);
          }
        }}
        icon={<IconWithBackground variant="error" size="large" icon={<FeatherX />} square={false} />}
        title="Action Failed"
        message={actionError || "Your action could not be submitted. Please try again."}
        children={<DiagnosticReportPanel report={actionErrorReport} />}
        footer={
          <Button
            variant="brand-primary"
            size="large"
            onClick={() => {
              setActionError(null);
              setActionErrorReport(null);
            }}
          >
            Close
          </Button>
        }
      />
    </>
  );
}
