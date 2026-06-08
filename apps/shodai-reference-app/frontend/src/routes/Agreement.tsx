import * as React from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { isAddress } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Button } from "@/subframe/components/Button";
import { DisplayCard } from "@/subframe/components/DisplayCard";
import { IconButton } from "@/subframe/components/IconButton";
import { Badge } from "@/subframe/components/Badge";
import { PageHeader } from "@/subframe/components/PageHeader";
import { Segment } from "@/subframe/components/Segment";
import { Avatar } from "@/subframe/components/Avatar";
import { CopyToClipboardButton } from "@/subframe/components/CopyToClipboardButton";
import { type AgreementJson } from "@cns-labs/agreements-protocol-evm";
import { resolveStateLabel } from "@/utils/agreementsUi";
import { SuccessDialog } from "@/components/SuccessDialog";
import { markdownWithValuesToHtml, printDocument } from "@/utils/documentExport";
import { markdownWithValues } from "@/utils/markdownWithValues";
import { useAgreementsApi, type ParticipantApi } from "@/hooks/useAgreementsApi";
import { useAgreementActivity } from "@/hooks/agreement/useAgreementActivity";
import { useAgreementData, formatPaymentAmount as formatPaymentAmountForActivity } from "@/hooks/agreement/useAgreementData";
import { useAgreementInputs } from "@/hooks/agreement/useAgreementInputs";
import { getChainLabel } from "@/utils/chainConfig";
import type { DocumentVariable } from "@/hooks/documentConfigure/types";
import {
  AgreementDocumentTab,
  AgreementStateMachineTab,
  AgreementActivityTab,
  AgreementOverviewTab,
  AgreementActionsTab,
} from "@/components/agreement";
import {
  FeatherArrowLeft,
  FeatherActivity,
  FeatherCircleDot,
  FeatherCopy,
  FeatherDownloadCloud,
  FeatherEye,
  FeatherFileInput,
  FeatherFileText,
  FeatherLayoutTemplate,
  FeatherLink,
  FeatherList,
  FeatherPrinter,
  FeatherUsers,
  FeatherWorkflow,
} from "@subframe/core";
// formatPaymentAmount function moved to useAgreementData hook

const AGREEMENT_TAB_TO_PATH = {
  overview: "",
  actions: "current-state",
  document: "document",
  stateMachine: "state-machine",
  activity: "activity",
} as const;

// Keep the legacy /actions alias so existing bookmarked links continue to work
// even though new navigation now points users to /current-state.
const AGREEMENT_PATH_TO_TAB = {
  "current-state": "actions",
  actions: "actions",
  document: "document",
  "state-machine": "stateMachine",
  activity: "activity",
} as const;

type AgreementTabId = keyof typeof AGREEMENT_TAB_TO_PATH;

const Agreement: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { id: routeAgreementId, tab: tabParam } = useParams<{ id: string; tab?: string }>();
  const [searchParams] = useSearchParams();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { getInputs } = useAgreementsApi();
  const requestedInputId = searchParams.get("input");

  const [documentThumbFailed, setDocumentThumbFailed] = React.useState(false);
  const [shareCopied, setShareCopied] = React.useState(false);
  const [showDeploySuccessModal, setShowDeploySuccessModal] = React.useState(false);
  const contentScrollRef = React.useRef<HTMLDivElement | null>(null);
  const lastConsumedInputLinkRef = React.useRef<string | null>(null);

  const tab = React.useMemo<AgreementTabId | null>(() => {
    if (!tabParam) return requestedInputId ? "actions" : "overview";
    return AGREEMENT_PATH_TO_TAB[tabParam as keyof typeof AGREEMENT_PATH_TO_TAB] ?? null;
  }, [requestedInputId, tabParam]);
  const activeTab: AgreementTabId = tab ?? "overview";

  // Form setup (dynamic variable keys, so use a string-keyed record)
  type FormValues = Record<string, any>;
  const form = useForm<FormValues>({
    defaultValues: {},
    mode: "onBlur",
    reValidateMode: "onBlur",
  });
  const currentStateForm = useForm<FormValues>({
    defaultValues: {},
    mode: "onBlur",
    reValidateMode: "onBlur",
  });

  const {
    formState: { errors },
    control,
  } = form;
  const {
    formState: { errors: currentStateErrors },
    control: currentStateControl,
  } = currentStateForm;

  // Agreement data hook
  const {
    record,
    agreementJson,
    currentState,
    participants,
    agreementAddress,
    loadError,
    title,
    stateLabel,
    isTerminalState,
    blockExplorerUrl,
    agreementTemplateId,
    deployApprovalWarning,
    refreshAgreement,
    refreshState,
    hasProcessedDeployModal,
  } = useAgreementData({ form });

  // Activity data hook
  const formatPaymentAmount = React.useCallback(
    (key: string, value: unknown, templateId: string | undefined) =>
      formatPaymentAmountForActivity(key, value, templateId),
    [],
  );


  const {
    activityInputs,
    activityWithInit,
    activityLoading,
    activityError,
    refreshInputs,
    setActivityError,
  } = useAgreementActivity({
    record,
    id: agreementAddress, // Use agreementAddress which can be UUID or contract address
    getInputs,
    formatPaymentAmount,
  });

  // Variables memo (needed for inputs hook)
  const variables = React.useMemo(() => {
    const json = agreementJson as any;
    if (!json?.variables) return {};
    const converted: Record<string, DocumentVariable> = {};
    Object.entries(json.variables).forEach(([key, variable]: [string, any]) => {
      converted[key] = {
        type: variable.type as DocumentVariable["type"],
        subType: variable.subType,
        name: variable.name,
        description: variable.description,
        validation: variable.validation,
      };
    });
    return converted;
  }, [agreementJson]);

  // Agreement inputs hook
  const {
    activeInputId,
    isWorking,
    isActionConfirmOpen,
    showActionSuccessModal,
    lastSubmittedAction,
    performableInputIds,
    nonPerformableInputIds,
    canSubmitAnyAvailableInput,
    activeInputDef,
    activeIssuerAddr,
    activeIssuerVarName,
    canSignActiveInput,
    nextActions,
    formFieldsForActiveInput,
    requiredFieldsForActiveInput,
    setActiveInputId,
    setShowActionSuccessModal,
    setLastSubmittedAction,
    handleClickSubmitAction,
    handleActionConfirmSubmit,
    handleActionDialogChange,
    actionError,
    actionErrorReport,
    setActionError,
    setActionErrorReport,
  } = useAgreementInputs({
    agreementJson,
    currentState,
    record,
    form: currentStateForm,
    variables,
    refreshAgreement,
    refreshState,
    refreshInputs,
  });

  React.useEffect(() => {
    if (!requestedInputId || !routeAgreementId || !agreementJson || !currentState || !address) return;

    const consumeKey = `${routeAgreementId}:${requestedInputId}`;
    if (lastConsumedInputLinkRef.current === consumeKey) return;

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("input");
    const nextSearch = nextSearchParams.toString();

    if (!performableInputIds.includes(requestedInputId)) {
      lastConsumedInputLinkRef.current = consumeKey;
      navigate(
        {
          pathname: `/agreement/${routeAgreementId}/current-state`,
          search: nextSearch ? `?${nextSearch}` : "",
        },
        { replace: true }
      );
      return;
    }

    setActiveInputId(requestedInputId);
    setActionError(null);
    setActionErrorReport(null);
    lastConsumedInputLinkRef.current = consumeKey;
    navigate(
      {
        pathname: `/agreement/${routeAgreementId}/current-state`,
        search: nextSearch ? `?${nextSearch}` : "",
      },
      { replace: true }
    );
  }, [
    agreementJson,
    address,
    currentState,
    navigate,
    performableInputIds,
    requestedInputId,
    routeAgreementId,
    searchParams,
    setActionError,
    setActionErrorReport,
    setActiveInputId,
  ]);

  // Deploy success modal handling
  React.useEffect(() => {
    if (hasProcessedDeployModal.current && record) {
      // Show modal after a brief delay to ensure smooth transition
      requestAnimationFrame(() => {
        setShowDeploySuccessModal(true);
      });
    }
  }, [record, hasProcessedDeployModal]);

  React.useEffect(() => {
    // Activity feed is used on the Activity tab, the Overview recent activity card,
    // and the Actions tab previous-input summary.
    if (activeTab !== "activity" && activeTab !== "overview" && activeTab !== "actions") return;
    // Avoid re-fetching on overview/actions if we already have data.
    if ((activeTab === "overview" || activeTab === "actions") && activityInputs.length > 0) return;
    refreshInputs().catch((e: any) => setActivityError(e?.message || "Failed to load activity"));
  }, [activityInputs.length, activeTab, refreshInputs, setActivityError]);

  // agreementJson loading is handled by useAgreementData

  // Participants to display: use API participants, or derive from record.variables when empty (for deployed agreements)
  const displayParticipants = React.useMemo(() => {
    if (participants.length > 0) return participants;
    const vars = record?.variables as Record<string, unknown> | undefined;
    const variableDefs = (agreementJson as any)?.variables || {};
    if (!vars) return [];
    const derived: ParticipantApi[] = [];
    Object.entries(variableDefs).forEach(([key, varDef]: [string, any]) => {
      if (varDef?.subType === "participant" && vars[key]) {
        const val = vars[key];
        if (typeof val === "string" && isAddress(val)) {
          derived.push({
            variableKey: key,
            walletAddress: val,
            firstName: varDef?.name ? varDef.name.split(" ")[0] : undefined,
            lastName: varDef?.name ? varDef.name.split(" ").slice(1).join(" ") : undefined,
          });
        }
      }
    });
    return derived;
  }, [participants, record?.variables, agreementJson]);

  // agreementTemplateId now provided by useAgreementData

  React.useEffect(() => {
    setDocumentThumbFailed(false);
  }, [agreementTemplateId]);

  // Fallback: markdown preview when thumbnail unavailable
  const documentPreviewMarkdown = React.useMemo(() => {
    const content = (agreementJson as any)?.content;
    if (!content?.type || !content?.data) return "";
    if (content.type === "md") {
      const md = String(content.data ?? "");
      // formatPaymentAmount is handled in useAgreementData, so variables are already formatted
      return markdownWithValues(md, record?.variables ?? {}, {
        templateId: agreementTemplateId,
        variables,
      });
    }
    return "";
  }, [agreementJson, record?.variables, agreementTemplateId, variables]);

  // Compute previous and next states for the Actions & Inputs widget
  const initialState = React.useMemo(
    () => (agreementJson as any)?.execution?.initialize?.initialState as string | undefined,
    [agreementJson]
  );

  const previousStateId = React.useMemo(() => {
    if (!agreementJson || !currentState) return null;
    const transitions = (agreementJson as any)?.execution?.transitions || [];
    // When in initial state, the "previous step" was initialization (no transition leads TO it)
    if (currentState === initialState) {
      return "__initialization__";
    }
    // Prefer deriving from activity: the last input tells us which transition actually happened
    const lastInput = activityInputs[0];
    if (lastInput?.inputId && lastInput.inputId !== "__initialization__") {
      for (const t of transitions) {
        if (t?.to !== currentState) continue;
        const conds = Array.isArray(t?.conditions) ? t.conditions : [];
        for (const c of conds) {
          if (c?.input === lastInput.inputId) {
            return t?.from as string | null;
          }
        }
      }
    }
    // Fallback: find any transition that leads TO the current state
    for (const t of transitions) {
      if (t?.to === currentState) {
        return t?.from as string | null;
      }
    }
    return null;
  }, [agreementJson, currentState, initialState, activityInputs]);

  const previousStateLabel = React.useMemo(() => {
    if (!previousStateId) return null;
    if (previousStateId === "__initialization__") return "Initialization";
    return (
      resolveStateLabel({ agreementJson: agreementJson as any, stateId: previousStateId }) ||
      String(previousStateId)
    );
  }, [agreementJson, previousStateId]);

  const canReviewPreviousInput = React.useMemo(() => {
    const hasInitialValues = !!record?.variables && Object.keys(record.variables).length > 0;
    const hasPreviousInput = activityInputs.length > 0;
    const inInitialState = currentState === initialState;
    const isPrevStepInit = previousStateId === initialState;

    return inInitialState && hasInitialValues
      ? true
      : !!(previousStateLabel && (hasPreviousInput || (isPrevStepInit && hasInitialValues)));
  }, [activityInputs.length, currentState, initialState, previousStateId, previousStateLabel, record?.variables]);

  const shouldOpenPreviousInput = searchParams.get("focus") === "previous-input";

  // requiredFieldsForActiveInput now handled by useAgreementInputs

  // handleSubmitActiveInput, handleClickSubmitAction, handleActionConfirmSubmit, handleActionDialogChange now handled by useAgreementInputs

  const handleBack = () => {
    navigate("/home");
  };

  React.useEffect(() => {
    if (!routeAgreementId) return;
    if (tabParam === "overview" || tab === null) {
      navigate(`/agreement/${routeAgreementId}`, { replace: true });
    }
  }, [navigate, routeAgreementId, tab, tabParam]);

  React.useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    contentScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname, location.search]);

  const navigateToTab = React.useCallback((nextTab: AgreementTabId, options?: { focusPreviousInput?: boolean; replace?: boolean }) => {
    if (!routeAgreementId) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    if (options?.focusPreviousInput) {
      nextSearchParams.set("focus", "previous-input");
    } else {
      nextSearchParams.delete("focus");
    }
    const nextPathPart = AGREEMENT_TAB_TO_PATH[nextTab];
    navigate(
      {
        pathname: nextPathPart ? `/agreement/${routeAgreementId}/${nextPathPart}` : `/agreement/${routeAgreementId}`,
        search: nextSearchParams.toString() ? `?${nextSearchParams.toString()}` : "",
      },
      { replace: options?.replace }
    );
  }, [navigate, routeAgreementId, searchParams]);

  // title, stateLabel, isTerminalState, and blockExplorerUrl now provided by useAgreementData

  const handleDocumentPdfOrPrint = React.useCallback(async () => {
    try {
      const content = (agreementJson as any)?.content;
      let md: string;
      if (content?.type === "md") {
        md = String(content.data ?? "");
      } else if (content?.type === "mdast" && content.data) {
        const { unified } = await import("unified");
        const { default: remarkStringify } = await import("remark-stringify");
        const processor = unified().use(remarkStringify as any);
        const result = (processor as any).stringify(content.data);
        md = typeof result === "string" ? result : String(result);
      } else {
        return;
      }
      if (!md.trim()) return;
      const templateId = (agreementJson as any)?.metadata?.templateId || (agreementJson as any)?.metadata?.id;
      const html = await markdownWithValuesToHtml(md, record?.variables ?? {}, {
        templateId,
        variables,
      });
      const docTitle = String((record as any)?.displayName || (agreementJson as any)?.metadata?.name || "Agreement");
      printDocument(html, docTitle);
    } catch (e) {
      console.error("Failed to generate document for PDF/print:", e);
    }
  }, [agreementJson, record, variables]);

  const handleShare = async () => {
    try {
      const link = `${window.location.origin}${window.location.pathname}`;
      await navigator.clipboard.writeText(link);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy share link to clipboard:", e);
    }
  };

  const handleCopyContract = async () => {
    try {
      await navigator.clipboard.writeText(agreementAddress);
    } catch (e) {
      console.error("Failed to copy contract address to clipboard:", e);
    }
  };

  const handleSetTab = React.useCallback((nextTab: AgreementTabId) => {
    navigateToTab(nextTab);
  }, [navigateToTab]);

  const handleOpenActions = React.useCallback(() => {
    navigateToTab("actions");
  }, [navigateToTab]);

  const handleReviewPreviousInput = React.useCallback(() => {
    navigateToTab("actions", { focusPreviousInput: true });
  }, [navigateToTab]);

  if (!agreementAddress) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-default-background">
        <div className="flex w-full flex-col items-center justify-center gap-4 px-6 py-12 container max-w-6xl mx-auto">
          <p className="text-body font-body text-subtext-color">Missing agreement address</p>
          <Button onClick={handleBack}>Back</Button>
        </div>
      </div>
    );
  }

  if (!agreementJson) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-default-background">
        <div className="flex w-full flex-col items-center justify-center gap-4 px-6 py-12 container max-w-6xl mx-auto">
          <p className="text-body font-body text-subtext-color">{loadError ? loadError : "Loading agreement…"}</p>
          <Button onClick={handleBack}>Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col items-center bg-neutral-50">
      <PageHeader
        title={title}
        tags={
          <>
            <Badge className="h-7 w-auto flex-none" icon={<FeatherCircleDot />} iconRight={null}>
              {stateLabel}
            </Badge>
            <Badge className="h-7 w-auto flex-none" variant="neutral" icon={<FeatherLayoutTemplate />} iconRight={null}>
              {(agreementJson as any)?.metadata?.name || "Agreement"}
            </Badge>
            <Badge className="h-7 w-auto flex-none" variant="neutral">
              {getChainLabel(record?.chainId)}
            </Badge>
          </>
        }
        showTags={true}
        actions={
          <>
            <Button variant="neutral-secondary" icon={<FeatherArrowLeft />} onClick={handleBack}>
              Back
            </Button>
            <Button variant="neutral-secondary" icon={<FeatherLink />} onClick={handleShare}>
              {shareCopied ? "Link copied!" : "Share"}
            </Button>
            <IconButton className="mobile:hidden" variant="neutral-secondary" icon={<FeatherDownloadCloud />} onClick={handleDocumentPdfOrPrint} title="Download as PDF" />
            <IconButton className="mobile:hidden" variant="neutral-secondary" icon={<FeatherPrinter />} onClick={handleDocumentPdfOrPrint} title="Print document" />
          </>
        }
        controls={
          <Segment
            items={
              <>
                <Segment.Item icon={<FeatherList />} active={activeTab === "overview"} onClick={() => handleSetTab("overview")}>
                  Overview
                </Segment.Item>
                <Segment.Item icon={<FeatherFileInput />} active={activeTab === "actions"} onClick={() => handleSetTab("actions")}>
                  Current State
                </Segment.Item>
                <Segment.Item icon={<FeatherFileText />} active={activeTab === "document"} onClick={() => handleSetTab("document")}>
                  Document View
                </Segment.Item>
                <Segment.Item icon={<FeatherWorkflow />} active={activeTab === "stateMachine"} onClick={() => handleSetTab("stateMachine")}>
                  State Machine Map
                </Segment.Item>
                <Segment.Item icon={<FeatherActivity />} active={activeTab === "activity"} onClick={() => handleSetTab("activity")}>
                  Activity
                </Segment.Item>
              </>
            }
          />
        }
      />
      <div ref={contentScrollRef} className="flex w-full grow shrink-0 basis-0 flex-col items-center gap-6 px-6 py-8 mobile:px-4 mobile:py-4 overflow-y-auto bg-neutral-50">
        {activeTab === "overview" ? (
          <AgreementOverviewTab
            record={record}
            agreementJson={agreementJson}
            currentState={currentState}
            stateLabel={stateLabel}
            agreementAddress={agreementAddress}
            blockExplorerUrl={blockExplorerUrl}
            agreementTemplateId={agreementTemplateId}
            chainName={getChainLabel(record?.chainId)}
            displayParticipants={displayParticipants}
            variables={variables}
            performableInputIds={performableInputIds}
            canSubmitAnyAvailableInput={canSubmitAnyAvailableInput}
            activityInputs={activityInputs}
            activityWithInit={activityWithInit}
            activityLoading={activityLoading}
            previousStateLabel={previousStateLabel}
            canReviewPreviousInput={canReviewPreviousInput}
            documentThumbFailed={documentThumbFailed}
            documentPreviewMarkdown={documentPreviewMarkdown}
            connectedAddress={address}
            onSetTab={handleSetTab}
            onOpenActions={handleOpenActions}
            onReviewPreviousInput={handleReviewPreviousInput}
            onDocumentPdfOrPrint={handleDocumentPdfOrPrint}
            onCopyContract={handleCopyContract}
            onDocumentThumbError={() => setDocumentThumbFailed(true)}
          />
        ) : null}

        {activeTab !== "overview" ? (
          <div className="flex w-full max-w-[1280px] grow shrink-0 basis-0 items-start justify-center gap-4 min-h-0">
            {activeTab === "actions" ? (
              <AgreementActionsTab
                record={record}
                agreementJson={agreementJson}
                currentState={currentState}
                stateLabel={stateLabel}
                previousStateId={previousStateId}
                previousStateLabel={previousStateLabel}
                activityInputs={activityInputs}
                participants={participants}
                displayParticipants={displayParticipants}
                variables={variables}
                performableInputIds={performableInputIds}
                nonPerformableInputIds={nonPerformableInputIds}
                activeInputId={activeInputId}
                activeInputDef={activeInputDef}
                formFieldsForActiveInput={formFieldsForActiveInput}
                requiredFieldsForActiveInput={requiredFieldsForActiveInput}
                canSignActiveInput={canSignActiveInput}
                activeIssuerAddr={activeIssuerAddr}
                activeIssuerVarName={activeIssuerVarName}
                isTerminalState={isTerminalState}
                blockExplorerUrl={blockExplorerUrl}
                connectedAddress={address}
                hasWalletClient={!!walletClient}
                hasPublicClient={!!publicClient}
                form={currentStateForm}
                control={currentStateControl}
                errors={currentStateErrors || {}}
                setActiveInputId={setActiveInputId}
                handleClickSubmitAction={handleClickSubmitAction}
                handleActionConfirmSubmit={handleActionConfirmSubmit}
                handleActionDialogChange={handleActionDialogChange}
                isWorking={isWorking}
                isActionConfirmOpen={isActionConfirmOpen}
                showActionSuccessModal={showActionSuccessModal}
                lastSubmittedAction={lastSubmittedAction}
                setShowActionSuccessModal={setShowActionSuccessModal}
                setLastSubmittedAction={setLastSubmittedAction}
                actionError={actionError}
                actionErrorReport={actionErrorReport}
                setActionError={setActionError}
                setActionErrorReport={setActionErrorReport}
                openPreviousInputAccordion={shouldOpenPreviousInput}
                onReturnToOverview={() => { setShowActionSuccessModal(false); setLastSubmittedAction(null); navigateToTab("overview"); }}
              />
            ) : (
              <div className="flex max-w-[1280px] grow shrink-0 basis-0 flex-col items-center gap-4 self-stretch bg-default-background">
                <DisplayCard
                  className="w-full max-w-[1280px] grow"
                  title={activeTab === "document" ? "Document" : activeTab === "stateMachine" ? "State Machine" : "Activity"}
                  content={
                  <div className="flex w-full flex-col items-start gap-6 px-4 py-4">
                  {activeTab === "document" ? (
                    <AgreementDocumentTab
                      content={(agreementJson as any).content || { type: "md", data: "No content available" }}
                      variables={variables}
                      control={control}
                      errors={errors || {}}
                      nextActions={nextActions}
                      userAddress={address || ""}
                    />
                  ) : activeTab === "stateMachine" ? (
                    <AgreementStateMachineTab agreementJson={agreementJson as AgreementJson} currentState={currentState} />
                  ) : (
                    <AgreementActivityTab
                      activityInputs={activityInputs}
                      activityWithInit={activityWithInit}
                      activityLoading={activityLoading}
                      activityError={activityError}
                      agreementJson={agreementJson}
                      variables={variables}
                    />
                  )}
                  </div>
                  }
                />
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Deploy Success Modal */}
      <SuccessDialog
        open={showDeploySuccessModal}
        onOpenChange={(open) => {
          if (!open) setShowDeploySuccessModal(false);
        }}
        title="Agreement Deployed"
        message={
          <>
            Your agreement has been successfully deployed and is now active.
            {deployApprovalWarning ? " Review the token approval warning below before relying on token-backed payment actions." : null}
          </>
        }
        footer={
          <Button
            variant="brand-primary"
            size="large"
            icon={<FeatherEye />}
            onClick={() => {
              setShowDeploySuccessModal(false);
            }}
          >
            View Agreement
          </Button>
        }
      >
        {deployApprovalWarning ? (
          <DisplayCard
            title="Token Approval Warning"
            content={
              <div className="flex flex-col items-start gap-2 px-4 py-4">
                <span className="text-body font-body text-default-font">{deployApprovalWarning}</span>
              </div>
            }
          />
        ) : null}

        <DisplayCard
          title="Agreement Name"
          content={
            <div className="flex flex-col items-start gap-2 px-4 py-4">
              <Badge className="h-4 w-auto flex-none" variant="neutral" icon={<FeatherLayoutTemplate />} iconRight={null}>
                {record?.displayName || (agreementJson as any)?.metadata?.name || "Agreement"}
              </Badge>
            </div>
          }
        />

        {participants.length > 0 && (
          <DisplayCard
            icon={<FeatherUsers />}
            title="Participants"
            content={
            <div className="flex w-full flex-col items-start gap-4 px-4 py-4">
              {participants.map((participant, idx) => {
                const fullName = [participant.firstName, participant.lastName].filter(Boolean).join(" ");
                const email = participant.email || "";
                // Get the variable name from the variable definition instead of using the key
                const variableDef = participant.variableKey ? variables[participant.variableKey] : null;
                const roleName = variableDef?.name || participant.variableKey || "Participant";
                const initial = (fullName?.[0] || email?.[0] || "P").toUpperCase();

                return (
                  <React.Fragment key={participant.variableKey || idx}>
                    {idx > 0 && <div className="flex h-px w-full flex-none items-start bg-neutral-border" />}
                    <div className="flex w-full items-center justify-between px-2 py-2 mobile:px-0 mobile:py-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar>{initial}</Avatar>
                        <div className="flex flex-col items-start min-w-0">
                          <span className="line-clamp-1 text-body-bold font-body-bold text-default-font">
                            {fullName || roleName}
                          </span>
                          {email && <span className="text-caption font-caption text-subtext-color">{email}</span>}
                          {participant.walletAddress && (
                            <span className="text-caption font-caption text-subtext-color font-mono break-all">
                              {participant.walletAddress}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="neutral">{roleName}</Badge>
                        {participant.walletAddress && (
                          <CopyToClipboardButton
                            clipboardText={participant.walletAddress}
                            tooltipText="Copy wallet address"
                            icon={<FeatherCopy />}
                          />
                        )}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
            }
          />
        )}
      </SuccessDialog>
    </div>
  );
};

export default Agreement;
