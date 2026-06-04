import * as React from "react";
import { keccak256, stringToHex } from "viem";
import { Accordion } from "@/subframe/components/Accordion";
import { Button } from "@/subframe/components/Button";
import { DisplayCard } from "@/subframe/components/DisplayCard";
import { Loader } from "@/subframe/components/Loader";
import { Avatar } from "@/subframe/components/Avatar";
import { Badge } from "@/subframe/components/Badge";
import { IconWithBackground } from "@/subframe/components/IconWithBackground";
import { TextField } from "@/subframe/components/TextField";
import { VariableField } from "@/components/VariableField";
import { ConfirmFlowDialog } from "@/components/ConfirmFlowDialog";
import { DiagnosticReportPanel } from "@/components/DiagnosticReportPanel";
import { SuccessDialog } from "@/components/SuccessDialog";
import {
  formatDiagnosticReport,
  summarizeRecordForDiagnostic,
  summarizeTypedDataForDiagnostic,
  useWalletDiagnostics,
} from "@/hooks/useWalletDiagnostics";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { ReadOnlyLongText } from "@/components/agreement/readOnlyLongText";
import { isReadOnlyLongTextVariable } from "@/components/agreement/readOnlyLongTextLogic";
import { FeatherAlertCircle, FeatherBlocks, FeatherChevronUp, FeatherEye, FeatherFileInput, FeatherInfo, FeatherLayoutTemplate, FeatherList, FeatherMail, FeatherSliders, FeatherUsers, FeatherWorkflow, FeatherX } from "@subframe/core";
import { ValidationErrorBanner } from "@/components/ValidationErrorBanner";
import type { DocumentConfigureViewModel } from "@/hooks/useDocumentConfigure";
import type { DeployConfirmDetails } from "@/hooks/useDocumentDeploy";
import { formatOnchainReferenceValue } from "@/utils/onchainReferences";

export interface DocumentConfigureTabProps {
  /** View model from useDocumentConfigure (single object instead of 25+ props). */
  configure: DocumentConfigureViewModel;
  /** Whether to show validation errors (e.g. after failed deploy click). */
  showValidation: boolean;
  /** Called when user clicks "View in Map" to switch to state machine tab. */
  onNavigateToStateMachine: () => void;
  /** Returns ERC-20 etc. details for the confirm dialog. */
  getDeployConfirmDetails: () => DeployConfirmDetails;
  /** Runs the full deploy flow (resolve wallets, deploy, navigate on success). Receives current configure. */
  onConfirmDeploy: (configure: DocumentConfigureViewModel) => Promise<void>;
  /** True while deploy is in progress (keeps confirm dialog open in progress state). */
  isDeployWorking: boolean;
  /** Deploy error message when deploy fails (null when no error). */
  deployError: string | null;
  /** Structured diagnostic payload for support/debugging. */
  deployErrorReport: string | null;
  /** Clear deploy error (e.g. when user dismisses error modal). */
  setDeployError: (error: string | null) => void;
  /** Clear deploy diagnostics when user dismisses error modal. */
  setDeployErrorReport: (report: string | null) => void;
  /** Template for modal labels (e.g. metadata.name). */
  template: { metadata?: { id?: string; name?: string } } | null;
}

export function DocumentConfigureTab({
  configure,
  showValidation,
  onNavigateToStateMachine,
  getDeployConfirmDetails,
  onConfirmDeploy,
  isDeployWorking,
  deployError,
  deployErrorReport,
  setDeployError,
  setDeployErrorReport,
  template,
}: DocumentConfigureTabProps) {
  const captureDiagnostic = useWalletDiagnostics();
  const [deployConfirmOpen, setDeployConfirmOpen] = React.useState(false);
  const [deployValidationError, setDeployValidationError] = React.useState<ReturnType<typeof configure.getDeployValidationError>>(null);
  const fieldRefsMap = React.useRef<Record<string, HTMLElement | null>>({});

  // Close deploy confirm when error is shown (user will see error modal instead)
  React.useEffect(() => {
    if (deployError) setDeployConfirmOpen(false);
  }, [deployError]);
  const [deployConfirmDetails, setDeployConfirmDetails] = React.useState<DeployConfirmDetails | null>(null);

  const handleDeployClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      setDeployError(null);
      setDeployErrorReport(null);
      if (!configure.isDraft) return; // Already deployed, no-op
      const validationError = configure.getDeployValidationError();
      if (validationError) {
        setDeployValidationError(validationError);
        configure.onDeployClick(e); // Sets showValidation for form errors
        return;
      }
      setDeployValidationError(null);
      setDeployConfirmDetails(getDeployConfirmDetails());
      setDeployConfirmOpen(true);
    },
    [configure, getDeployConfirmDetails, setDeployError, setDeployErrorReport]
  );

  const handleDeployDialogChange = React.useCallback(
    (open: boolean) => {
      if (!open && isDeployWorking) return;
      setDeployConfirmOpen(open);
    },
    [isDeployWorking]
  );

  const handleModalCancel = React.useCallback(() => {
    if (!isDeployWorking) setDeployConfirmOpen(false);
  }, [isDeployWorking]);

  const handleModalDeploy = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      void onConfirmDeploy(configure);
    },
    [onConfirmDeploy, configure]
  );

  const handlePreviewDeployError = React.useCallback(() => {
    const previewInitValues = Object.fromEntries(
      Object.entries(configure.initValuesMap || {}).map(([key, value]) => [
        key,
        value == null || value === "" ? `[preview:${key}]` : String(value),
      ])
    );
    const previewDeadline = Math.floor(Date.now() / 1000) + 60 * 60;
    const previewDocSeed = JSON.stringify({
      templateId: template?.metadata?.id ?? "preview-template",
      templateName: template?.metadata?.name ?? "Preview Template",
      initKeys: Object.keys(previewInitValues),
    });
    const diagnostic = captureDiagnostic({
      flow: "agreement-deploy-preview",
      stage: "build-deploy-permit-preview",
      context: {
        templateId: template?.metadata?.id ?? null,
        templateName: template?.metadata?.name ?? null,
        isDraft: configure.isDraft,
        canClickDeploy: configure.canClickDeploy,
        participantCount: configure.participantKeys.length,
        nonParticipantCount: configure.nonParticipantKeys.length,
        signingIntent: "deploy-agreement-with-permit",
        participantsSummary: configure.participantKeys.map((key) => {
          const participant = configure.participantsMap[key];
          return {
            variableKey: key,
            hasEmail: !!participant?.email,
            emailDomain: participant?.email?.split("@")[1] ?? null,
            hasFirstName: !!participant?.firstName,
            hasLastName: !!participant?.lastName,
          };
        }),
        initValueSummary: summarizeRecordForDiagnostic(previewInitValues),
        signingAttempt: summarizeTypedDataForDiagnostic({
          domain: {
            name: "AgreementFactory",
            version: "1",
            verifyingContract: "0x0000000000000000000000000000000000000001",
          },
          primaryType: "PermitAgreementWithActions",
          types: {
            PermitAgreementWithActions: [
              { name: "docUri", type: "string" },
              { name: "docHash", type: "bytes32" },
              { name: "initialState", type: "bytes32" },
              { name: "inputDefsHash", type: "bytes32" },
              { name: "transitionsHash", type: "bytes32" },
              { name: "initVarsHash", type: "bytes32" },
              { name: "actionsHash", type: "bytes32" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          message: {
            docUri: `ipfs://agreement/${template?.metadata?.id ?? "preview-template"}`,
            docHash: keccak256(stringToHex(previewDocSeed)),
            initialState: keccak256(stringToHex("PREVIEW_INITIAL_STATE")),
            inputDefsHash: keccak256(stringToHex(`inputs:${Object.keys(previewInitValues).join(",")}`)),
            transitionsHash: keccak256(stringToHex("preview-transitions")),
            initVarsHash: keccak256(stringToHex(JSON.stringify(previewInitValues))),
            actionsHash: keccak256(stringToHex("preview-actions")),
            nonce: 0n,
            deadline: BigInt(previewDeadline),
          },
        }),
        previewMode: true,
      },
      error: new Error("Preview deployment error for diagnostics UI."),
    });
    setDeployError(`Preview deployment error. Reference: ${diagnostic.id}`);
    setDeployErrorReport(formatDiagnosticReport(diagnostic));
  }, [
    captureDiagnostic,
    configure.canClickDeploy,
    configure.isDraft,
    configure.initValuesMap,
    configure.nonParticipantKeys.length,
    configure.participantKeys,
    configure.participantsMap,
    setDeployError,
    setDeployErrorReport,
    template?.metadata?.id,
    template?.metadata?.name,
  ]);
  const {
    agreementName,
    onNameChange,
    onNameBlur,
    participantKeys,
    participantsMap,
    nonParticipantKeys,
    variables,
    participantInputs,
    participantErrors,
    touchedParticipantFields,
    touchedInitFields,
    initFieldErrors,
    initValuesMap,
    createParticipantFieldHandler,
    createParticipantFieldBlurHandler,
    createVariableFieldHandler,
    createVariableFieldBlurHandler,
    observersInput,
    onObserversInputChange,
    onSaveObservers,
    observerError,
    isWorking,
    isDraft,
  } = configure;

  const handleReviewNow = React.useCallback(() => {
    setDeployValidationError(null);
    const map = fieldRefsMap.current;
    if (!agreementName.trim()) {
      map["agreementName"]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    for (const k of participantKeys) {
      const pErrs = participantErrors[k] || {};
      if (pErrs.firstName) {
        map[`participant.${k}.firstName`]?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (pErrs.lastName) {
        map[`participant.${k}.lastName`]?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      if (pErrs.email) {
        map[`participant.${k}.email`]?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
    for (const k of nonParticipantKeys) {
      if (initFieldErrors[k]) {
        map[`init.${k}`]?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
    }
    map["agreementName"]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [
    agreementName,
    participantKeys,
    participantErrors,
    nonParticipantKeys,
    initFieldErrors,
  ]);

  return (
    <div className="flex w-full max-w-[768px] flex-col items-center gap-4 px-6 py-8 mobile:px-4 mobile:py-4">
      {/* Header */}
      <div className="flex w-full flex-col items-start gap-2">
        <span className="text-heading-2 font-heading-2 text-default-font">Configure Agreement</span>
        <span className="text-body font-body text-subtext-color">
          Assign participants and provide the deployment values required for this template.
        </span>
      </div>

      {/* Agreement Name */}
      <div
        ref={(el) => {
          fieldRefsMap.current["agreementName"] = el;
        }}
        className="flex w-full min-w-[224px] flex-col items-stretch rounded-lg border border-solid border-neutral-border bg-default-background shadow-sm"
      >
        <div className="w-full px-4 py-4">
        <TextField
          className="h-auto w-full flex-none"
          error={showValidation && !agreementName.trim()}
          label="Agreement Name"
          helpText="This name is used to identify the agreement in our system."
          iconRight={showValidation && !agreementName.trim() ? <FeatherAlertCircle /> : undefined}
        >
          <TextField.Input
            placeholder="Enter Name"
            value={agreementName}
            onChange={onNameChange}
            onBlur={onNameBlur}
          />
        </TextField>
        </div>
      </div>

      {/* Participants */}
        <DisplayCard
          icon={<FeatherUsers />}
          title="Participants"
          description="Assign users to the roles defined by the template"
          content={
          <div className="flex w-full flex-col items-start gap-4 px-6 pt-4 pb-6">
            {participantKeys.length > 0 ? (
              <>
                <div className="flex h-px w-full flex-none flex-col items-center gap-2 bg-neutral-border" />
                {participantKeys.map((k) => {
              const variable = variables[k];
              const roleName = variable?.name || k;
              const actionsForParticipant = participantInputs[k] || [];
              const pErrs = participantErrors[k] || {};
              const touched = touchedParticipantFields[k] || {};
              const showFirstNameErr = showValidation || !!touched.firstName;
              const showLastNameErr = showValidation || !!touched.lastName;
              const showEmailErr = showValidation || !!touched.email;

              return (
                <React.Fragment key={k}>
                  <div className="flex w-full flex-col items-start gap-2">
                    <div className="flex w-full items-center justify-between">
                      <span className="text-body-bold font-body-bold text-default-font">{roleName}</span>
                      <Button
                        variant="neutral-secondary"
                        size="small"
                        icon={<FeatherWorkflow />}
                        onClick={onNavigateToStateMachine}
                      >
                        View in Map
                      </Button>
                    </div>

                    <div className="flex w-full items-start gap-6 mobile:flex-row mobile:flex-wrap mobile:gap-6">
                      <div
                        ref={(el) => {
                          fieldRefsMap.current[`participant.${k}.firstName`] = el;
                        }}
                        className="grow shrink-0 basis-0"
                      >
                      <TextField
                        className="h-auto w-full"
                        variant="outline"
                        label="First Name"
                        helpText={showFirstNameErr && pErrs.firstName ? pErrs.firstName : ""}
                        error={showFirstNameErr && !!pErrs.firstName}
                      >
                        <TextField.Input
                          placeholder="Enter first name"
                          value={participantsMap[k]?.firstName ?? ""}
                          onChange={createParticipantFieldHandler(k, "firstName")}
                          onBlur={createParticipantFieldBlurHandler(k, "firstName")}
                        />
                      </TextField>
                      </div>
                      <div
                        ref={(el) => {
                          fieldRefsMap.current[`participant.${k}.lastName`] = el;
                        }}
                        className="grow shrink-0 basis-0"
                      >
                      <TextField
                        className="h-auto w-full"
                        variant="outline"
                        label="Last Name"
                        helpText={showLastNameErr && pErrs.lastName ? pErrs.lastName : ""}
                        error={showLastNameErr && !!pErrs.lastName}
                      >
                        <TextField.Input
                          placeholder="Enter last name"
                          value={participantsMap[k]?.lastName ?? ""}
                          onChange={createParticipantFieldHandler(k, "lastName")}
                          onBlur={createParticipantFieldBlurHandler(k, "lastName")}
                        />
                      </TextField>
                      </div>
                    </div>

                    <div
                      ref={(el) => {
                        fieldRefsMap.current[`participant.${k}.email`] = el;
                      }}
                      className="w-full"
                    >
                      <TextField
                        className="h-auto w-full flex-none"
                        variant="outline"
                        label="Email Address"
                        helpText={showEmailErr && pErrs.email ? pErrs.email : ""}
                        error={showEmailErr && !!pErrs.email}
                        icon={<FeatherMail />}
                      >
                        <TextField.Input
                          placeholder="Enter email address"
                          value={participantsMap[k]?.email ?? ""}
                          onChange={createParticipantFieldHandler(k, "email")}
                          onBlur={createParticipantFieldBlurHandler(k, "email")}
                        />
                      </TextField>
                    </div>

                    {actionsForParticipant.length > 0 && (
                      <div className="flex w-full flex-col items-start gap-2 rounded-md bg-neutral-50 px-1 py-1">
                        <Accordion
                          trigger={
                            <div className="flex w-full items-center gap-2 px-3 py-2">
                              <span className="grow shrink-0 basis-0 text-caption-bold font-caption-bold text-default-font">
                                {actionsForParticipant.length} Available Action
                                {actionsForParticipant.length !== 1 ? "s" : ""}
                              </span>
                              <Accordion.Chevron />
                            </div>
                          }
                        >
                          <div className="flex w-full grow shrink-0 basis-0 flex-col items-start gap-2 px-3 py-2">
                            {actionsForParticipant.map((action) => (
                              <div key={action.inputId} className="flex items-center gap-2">
                                <FeatherFileInput className="text-caption font-caption text-subtext-color" />
                                <span className="text-caption font-caption text-subtext-color">{action.label}</span>
                              </div>
                            ))}
                          </div>
                        </Accordion>
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}
              </>
            ) : null}
            <div className="flex h-px w-full flex-none flex-col items-center gap-2 bg-neutral-border" />
            <div className="flex w-full flex-col items-start gap-2">
              <div className="flex w-full items-center justify-between">
                <span className="text-body-bold font-body-bold text-default-font">
                  Observers
                </span>
                <Badge variant="neutral">Optional</Badge>
              </div>
              <TextField
                className="h-auto w-full flex-none"
                variant="outline"
                label=""
                helpText="Add multiple emails separated by commas. Observers can view the agreement but don't sign."
                error={!!observerError}
                icon={<FeatherEye />}
              >
                <TextField.Input
                  placeholder="observer1@example.com, observer2@example.com"
                  value={observersInput}
                  onChange={(e) => onObserversInputChange(e.target.value)}
                  onBlur={onSaveObservers}
                />
              </TextField>
            </div>
          </div>
          }
        />

      {/* State Machine Variables */}
      {nonParticipantKeys.length > 0 && (
        <DisplayCard
          icon={<FeatherSliders />}
          title="State Machine Variables"
          description="Provide every deployment-time variable referenced by initialization before deploying this agreement."
          content={
          <div className="flex w-full flex-col items-start gap-6 px-4 py-4">
            <div className="flex h-px w-full flex-none flex-col items-center gap-2 bg-neutral-border" />
            {nonParticipantKeys.map((k) => {
              const variable = variables[k];
              if (!variable) return null;

              const err = initFieldErrors[k];
              const shouldShow = showValidation || !!touchedInitFields[k];
              const isLongText = variable.subType === "longText";
              const isMarkdown = variable.subType === "markdown";

              return (
                <div
                  key={k}
                  ref={(el) => {
                    fieldRefsMap.current[`init.${k}`] = el;
                  }}
                  className="w-full"
                >
                <VariableField
                  fieldKey={k}
                  variable={variable}
                  value={initValuesMap[k] ?? ""}
                  onChange={createVariableFieldHandler(k)}
                  onBlur={createVariableFieldBlurHandler(k)}
                  error={err || undefined}
                  showError={shouldShow}
                  useTextArea={isLongText || isMarkdown}
                />
                </div>
              );
            })}
          </div>
          }
        />
      )}

      {/* Deploy validation error banner */}
      {deployValidationError && (
        <ValidationErrorBanner
          errorCount={deployValidationError.errorCount}
          title={deployValidationError.title}
          description={deployValidationError.description}
          action={
            deployValidationError.showReviewButton
              ? {
                  label: "Review Now",
                  icon: <FeatherChevronUp />,
                  onClick: handleReviewNow,
                }
              : undefined
          }
        />
      )}

      {/* Deploy button */}
      <div className="flex w-full flex-col items-end gap-4">
        <Button
          variant="brand-primary"
          size="large"
          icon={isWorking ? <Loader size="small" /> : <FeatherBlocks />}
          onClick={handleDeployClick}
          disabled={isWorking || !isDraft}
        >
          {isDraft ? "Deploy Agreement" : "Agreement Deployed"}
        </Button>
        {import.meta.env.DEV ? (
          <Button variant="neutral-secondary" size="small" onClick={handlePreviewDeployError}>
            Preview Error Dialog
          </Button>
        ) : null}
      </div>

      {/* Confirm deployment dialog (owned by configure tab) */}
      <ConfirmFlowDialog
        open={deployConfirmOpen || isDeployWorking}
        onOpenChange={handleDeployDialogChange}
        isWorking={isDeployWorking}
        title="Confirm Deployment"
        progressTitle="Deploying Onchain"
        progressMessage={"Your signed input is being deployed to the blockchain. \nThis may take a few moments."}
        footer={
          <>
            <Button variant="neutral-secondary" size="large" onClick={handleModalCancel} disabled={isDeployWorking}>
              Cancel
            </Button>
            <Button
              variant="brand-primary"
              size="large"
              icon={<FeatherBlocks />}
              onClick={handleModalDeploy}
              disabled={isDeployWorking || !configure.canClickDeploy}
            >
              Sign &amp; Deploy
            </Button>
          </>
        }
      >
        {/* Details */}
        <DisplayCard
          icon={<FeatherList />}
          title="Details"
          content={
          <div className="flex flex-col items-start gap-2 px-4 py-4">
            <span className="text-heading-2 font-heading-2 text-default-font">
              {configure.agreementName?.trim() || (template as any)?.metadata?.name || "Agreement"}
            </span>
            <Badge className="h-4 w-auto flex-none" variant="neutral" icon={<FeatherLayoutTemplate />} iconRight={null}>
              {template?.metadata?.name || "Template"}
            </Badge>
            {deployConfirmDetails?.chainName ? (
              <div className="flex w-full items-center gap-2 pt-2">
                <span className="text-caption font-caption text-subtext-color">
                  Deployment Network:
                </span>
                <Badge className="h-4 w-auto flex-none" variant="neutral">
                  {deployConfirmDetails.chainName}
                </Badge>
              </div>
            ) : null}
          </div>
          }
        />

        {/* Participants */}
        <DisplayCard
          icon={<FeatherUsers />}
          title="Participants"
          content={
          <div className="flex w-full flex-col items-start gap-4 px-4 py-4">
            {configure.participantKeys.length === 0 ? (
              <div className="text-body font-body text-subtext-color">No participants defined for this template.</div>
            ) : (
              configure.participantKeys.map((k) => {
                const variable = configure.variables[k];
                const roleName = variable?.name || k;
                const pData = configure.participantsMap[k];
                const fullName = [pData?.firstName, pData?.lastName].filter(Boolean).join(" ");
                const email = pData?.email || "";
                const walletAddr = configure.initValuesMap?.[k] ? String(configure.initValuesMap[k]).trim() : "";
                const initial = (fullName?.[0] || roleName?.[0] || "P").toUpperCase();

                return (
                  <div key={k} className="flex w-full items-center justify-between px-2 py-2 mobile:px-0 mobile:py-0">
                    <div className="flex items-center gap-2">
                      <Avatar>{initial}</Avatar>
                      <div className="flex flex-col items-start">
                        <span className="line-clamp-1 text-body-bold font-body-bold text-default-font">
                          {fullName || roleName}
                        </span>
                        {email && (
                          <span className="text-caption font-caption text-subtext-color">{email}</span>
                        )}
                        {walletAddr && (
                          <span className="text-caption font-caption text-subtext-color font-mono break-all">
                            {walletAddr}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">{roleName}</Badge>
                    </div>
                  </div>
                );
              })
            )}

            {(() => {
              const parsedObservers = configure.observersInput
                .split(",")
                .map((e) => e.trim())
                .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
              if (parsedObservers.length === 0) return null;

              return (
                <>
                  <div className="flex h-px w-full flex-none flex-col items-center gap-2 bg-neutral-border" />
                  <div className="flex w-full flex-col items-start gap-2">
                    <span className="text-body-bold font-body-bold text-default-font">Observers</span>
                    <div className="flex w-full flex-wrap items-center gap-2">
                      {parsedObservers.map((email, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 rounded-lg border border-solid border-neutral-border bg-default-background px-1 py-1"
                        >
                          <Avatar size="x-small">{email?.[0]?.toUpperCase() || "O"}</Avatar>
                          <span className="text-caption font-caption text-default-font">{email}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
          }
        />

        {/* State Machine Variables */}
        <DisplayCard
          icon={<FeatherSliders />}
          title="State Machine Variables"
          content={
          <div className="flex w-full flex-col items-start gap-4 px-4 py-4">
          <div className="flex w-full items-start gap-3 rounded-md bg-brand-50 px-4 py-3">
            <FeatherInfo className="text-body font-body text-brand-700 mt-0.5" />
            <div className="flex grow shrink-0 basis-0 flex-col items-start gap-1">
              <span className="text-caption-bold font-caption-bold text-brand-800">Data Visibility Notice</span>
              <span className="text-caption font-caption text-brand-800">
                All state machine variables will be visible onchain
              </span>
            </div>
          </div>
          {configure.nonParticipantKeys.length > 0 ? (
            <div className="flex w-full flex-col items-start gap-3 rounded-md border border-solid border-neutral-border bg-neutral-50 px-4 py-3">
              {configure.nonParticipantKeys.map((k) => {
                const raw = configure.initValuesMap?.[k];
                const val = raw == null ? "" : String(raw).trim();
                const variable = (configure.variables as any)?.[k];
                const label = variable?.name || k;
                const isLongText = isReadOnlyLongTextVariable(variable);
                const isMarkdown = variable?.subType === "markdown";
                const displayValue = formatOnchainReferenceValue(val, variable, { mode: "document" });
                return (
                  <div
                    key={k}
                    className={`flex w-full ${isLongText || isMarkdown ? "flex-col items-start gap-1" : "items-center gap-2"}`}
                  >
                    <span className="text-caption font-caption text-subtext-color">{label}:</span>
                    {isMarkdown && val ? (
                      <MarkdownRenderer content={val} />
                    ) : isLongText && displayValue ? (
                      <ReadOnlyLongText
                        text={displayValue}
                        containerClassName="w-full text-left"
                        textClassName="whitespace-pre-wrap break-words text-caption font-caption text-default-font"
                        buttonClassName="ml-1 inline p-0 text-caption font-caption text-brand-700 hover:underline"
                      />
                    ) : (
                      <span className="text-caption font-caption text-default-font break-words">
                        {displayValue || <span className="text-subtext-color">(not set)</span>}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
          {deployConfirmDetails?.needsErc20Approval ? (
            <div className="flex w-full items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
              <FeatherInfo className="text-body font-body text-amber-700 mt-0.5" />
              <div className="flex grow shrink-0 basis-0 flex-col items-start gap-1">
                <span className="text-caption-bold font-caption-bold text-amber-900">ERC-20 allowance required</span>
                <span className="text-caption font-caption text-amber-900/90">
                  This template includes an on-chain <span className="font-mono">transferFrom</span> action. After
                  deployment, the app may prompt the grantor wallet to approve the agreement contract to spend tokens.
                </span>
              </div>
            </div>
          ) : null}
          </div>
          }
        />
      </ConfirmFlowDialog>

      <SuccessDialog
        open={!!deployError}
        onOpenChange={(open) => {
          if (!open) {
            setDeployError(null);
            setDeployErrorReport(null);
          }
        }}
        icon={<IconWithBackground variant="error" size="large" icon={<FeatherX />} square={false} />}
        title="Deployment Failed"
        message={deployError || "Deployment failed. Please try again."}
        children={<DiagnosticReportPanel report={deployErrorReport} />}
        footer={
          <Button
            variant="brand-primary"
            size="large"
            onClick={() => {
              setDeployError(null);
              setDeployErrorReport(null);
            }}
          >
            Close
          </Button>
        }
      />
    </div>
  );
}
