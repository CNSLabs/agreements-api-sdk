import * as React from 'react';
import { useParams, useNavigate } from 'react-router';
import { useForm, useWatch } from 'react-hook-form';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DocumentConfigureTab,
  DocumentDocumentTab,
  DocumentStateMachineTab,
} from "@/components/document";
import { DeploymentNetworkSelect } from "@/components/DeploymentNetworkSelect";
import { useDocumentConfigure } from "@/hooks/useDocumentConfigure";
import type { DocumentVariable } from "@/hooks/useDocumentConfigure";
import { useDocumentDeploy } from "@/hooks/useDocumentDeploy";
import { Button } from "@/subframe/components/Button";
import { Badge } from "@/subframe/components/Badge";
import { IconButton } from "@/subframe/components/IconButton";
import { DisplayCard } from "@/subframe/components/DisplayCard";
import { PageHeader } from "@/subframe/components/PageHeader";
import { Segment } from "@/subframe/components/Segment";
import { DialogLayout } from "@/subframe/layouts/DialogLayout";
import { useAgreementsApi, type AgreementRecordApi } from "@/hooks/useAgreementsApi";
import type { AgreementJson } from "@cns-labs/agreements-protocol-evm";
import { extractIssuerVariableKeys } from "@/utils/agreementsUi";
import { getChainConfig, getDefaultChainConfig, getSupportedChainConfigs } from "@/utils/chainConfig";
import {
  FeatherAlertTriangle,
  FeatherCircleDot,
  FeatherCheck,
  FeatherFileText,
  FeatherLayoutTemplate,
  FeatherLoader,
  FeatherSliders,
  FeatherTrash2,
  FeatherWorkflow,
  FeatherX,
} from "@subframe/core";

const Document: React.FC = () => {
  const { draftId } = useParams<{ draftId: string }>();
  const navigate = useNavigate();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [activeTab, setActiveTab] = React.useState<"configure" | "document" | "stateMachine">("configure");
  const [showValidation, setShowValidation] = React.useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const queryClient = useQueryClient();
  const { getAgreement, updateDraftValues, updateDraftDisplayName, updateDraftChainId, deleteDraft, setParticipants, getParticipants, setObservers: setObserversApi } = useAgreementsApi();

  const updateDraftCache = React.useCallback((updatedRecord: AgreementRecordApi) => {
    queryClient.setQueryData(['agreement', draftId], updatedRecord);
  }, [queryClient, draftId]);

  // ---------------------------------------------------------------------------
  // Load draft from API
  // ---------------------------------------------------------------------------
  const {
    data: draft = null,
    isLoading: draftLoading,
    error: draftQueryError,
  } = useQuery<AgreementRecordApi | null>({
    queryKey: ['agreement', draftId],
    queryFn: async () => {
      try {
        return await getAgreement(draftId!);
      } catch (e: any) {
        const status = e?.response?.status;
        const msg = e?.response?.data?.message || e?.message;
        if (status === 403) {
          throw new Error("You do not have permission to view this agreement. Only participants, observers, or the owner can access it.");
        }
        throw new Error(msg || "Failed to load agreement draft");
      }
    },
    enabled: !!draftId,
    retry: false,
  });
  const draftLoadError = draftQueryError ? (draftQueryError as Error).message : null;

  // Derive template-like fields from the loaded draft
  const template = (draft?.json ?? null) as AgreementJson | null;
  const agreementJson = React.useMemo(() => template as AgreementJson, [template]);

  // Convert template variables to DocumentVariable format
  const variables = React.useMemo(() => {
    if (!template?.variables) return {};

    const converted: Record<string, DocumentVariable> = {};
    Object.entries(template.variables).forEach(([key, variable]: [string, any]) => {
      converted[key] = {
        type: variable.type as DocumentVariable['type'],
        subType: variable.subType,
        name: variable.name,
        description: variable.description,
        validation: variable.validation,
      };
    });
    return converted;
  }, [template]);

  // Get initial params from template execution.initialize.data
  const initKeys = React.useMemo(() => {
    const initData = (template as any)?.execution?.initialize?.data;
    if (!initData) return [];
    return Object.keys(initData);
  }, [template]);

  const initialParams = React.useMemo<Record<string, string>>(() => {
    // MarkdownDocumentView enables init fields by checking Object.keys(initialParams)
    const obj: Record<string, string> = {};
    for (const k of initKeys) obj[k] = "1";
    return obj;
  }, [initKeys]);

  // ---------------------------------------------------------------------------
  // Participant vs non-participant variable keys
  // ---------------------------------------------------------------------------
  const participantKeys = React.useMemo(() => {
    return initKeys.filter((k) => {
      const v = variables[k];
      return v?.subType === "participant";
    });
  }, [initKeys, variables]);

  const nonParticipantKeys = React.useMemo(() => {
    return initKeys.filter((k) => {
      const v = variables[k];
      return v?.subType !== "participant";
    });
  }, [initKeys, variables]);

  // Map participant variable → inputs that reference it as issuer
  const participantInputs = React.useMemo(() => {
    const inputs = (template as any)?.execution?.inputs || {};
    const result: Record<string, { inputId: string; label: string }[]> = {};

    for (const [inputId, inputDef] of Object.entries(inputs)) {
      const issuerVarKeys = extractIssuerVariableKeys((inputDef as any)?.issuer);
      for (const varKey of issuerVarKeys) {
        if (!result[varKey]) result[varKey] = [];
        result[varKey].push({
          inputId,
          label: (inputDef as any)?.displayName || inputId,
        });
      }
    }

    return result;
  }, [template]);

  // ---------------------------------------------------------------------------
  // Form setup (dynamic variable keys, so use a string-keyed record)
  type FormValues = Record<string, any>;
  const form = useForm<FormValues>({
    defaultValues: {},
    mode: 'onBlur',
    reValidateMode: 'onBlur'
  });

  const {
    formState: { errors },
    control,
  } = form;

  // Pre-populate form with values from the draft record
  const hasHydratedForm = React.useRef(false);
  React.useEffect(() => {
    if (!draft || hasHydratedForm.current) return;
    const storedVars = (draft.variables || {}) as Record<string, any>;
    for (const k of initKeys) {
      if (storedVars[k] != null && storedVars[k] !== "") {
        form.setValue(k, storedVars[k]);
      }
    }
    hasHydratedForm.current = true;
  }, [draft, form, initKeys]);

  // Watch init fields so the sidebar inputs + validation update live.
  const initWatched = useWatch({
    control,
    name: initKeys as any,
  });

  const initValuesMap = React.useMemo(() => {
    const m: Record<string, any> = {};
    initKeys.forEach((k, i) => {
      const v = Array.isArray(initWatched) ? initWatched[i] : (form.getValues() as any)?.[k];
      m[k] = v;
    });
    return m;
  }, [form, initKeys, initWatched]);

  const deploy = useDocumentDeploy({
    draft,
    draftId: draftId ?? undefined,
    template,
    form,
    initKeys,
    setShowValidation,
    navigate,
    onDraftUpdated: updateDraftCache,
  });

  const configure = useDocumentConfigure({
    draft,
    draftId: draftId ?? undefined,
    template,
    initKeys,
    variables,
    participantKeys,
    nonParticipantKeys,
    participantInputs,
    form,
    initValuesMap,
    isWorking: deploy.isDeployWorking,
    setShowValidation,
    updateDraftValues,
    updateDraftDisplayName,
    setParticipants,
    getParticipants,
    setObserversApi,
    onDraftUpdated: updateDraftCache,
    address: address ?? undefined,
    hasWallet: !!(walletClient && publicClient),
  });

  // ---------------------------------------------------------------------------
  // Memoize dialog onOpenChange handler
  // ---------------------------------------------------------------------------
  const handleSetActiveTabConfigure = React.useCallback(() => {
    setActiveTab("configure");
  }, []);

  const handleSetActiveTabDocument = React.useCallback(() => {
    setActiveTab("document");
  }, []);

  const handleSetActiveTabStateMachine = React.useCallback(() => {
    setActiveTab("stateMachine");
  }, []);

  // Memoize navigation handlers
  const handleNavigateToCreate = React.useCallback(() => {
    navigate('/create');
  }, [navigate]);

  const handleDeleteModalClose = React.useCallback(() => {
    if (!isDeleting) setIsDeleteOpen(false);
  }, [isDeleting]);

  const handleDeleteModalCancel = React.useCallback(() => {
    if (!isDeleting) setIsDeleteOpen(false);
  }, [isDeleting]);

  const handleDeleteDialogChange = React.useCallback((open: boolean) => {
    if (isDeleting) return;
    setIsDeleteOpen(open);
  }, [isDeleting]);

  const handleCancel = React.useCallback(() => {
    navigate("/home");
  }, [navigate]);

  const handleDeleteDraft = React.useCallback(async () => {
    if (!draftId || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteDraft(draftId);
      setIsDeleteOpen(false);
      navigate("/home");
    } catch (err: any) {
      console.error("Failed to delete draft:", err);
      // Error handling for delete - could show toast or similar
      setIsDeleting(false);
    }
  }, [draftId, isDeleting, deleteDraft, navigate]);

  const supportedChains = React.useMemo(() => getSupportedChainConfigs(), []);
  const selectedChainId = draft?.chainId || getDefaultChainConfig().chainId;
  const selectedChainName = React.useMemo(() => {
    try {
      return getChainConfig(selectedChainId).chainName;
    } catch {
      return `Chain ${selectedChainId}`;
    }
  }, [selectedChainId]);
  const handleDraftChainChange = React.useCallback(async (chainId: number) => {
    if (!draftId) return;
    const updated = await updateDraftChainId(draftId, chainId);
    updateDraftCache(updated);
  }, [draftId, updateDraftCache, updateDraftChainId]);

  // ---------------------------------------------------------------------------
  // Loading / error / not-found states
  // ---------------------------------------------------------------------------
  if (draftLoading) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-4 px-6 py-12 container max-w-6xl mx-auto min-h-screen">
        <span className="text-body font-body text-subtext-color">Loading draft…</span>
      </div>
    );
  }

  if (draftLoadError || !draft) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-4 px-6 py-12 container max-w-6xl mx-auto min-h-screen">
        <p className="text-body font-body text-subtext-color">{draftLoadError || "Draft not found"}</p>
        <Button onClick={handleNavigateToCreate}>Back to Templates</Button>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-4 px-6 py-12 container max-w-6xl mx-auto min-h-screen">
        <p className="text-body font-body text-subtext-color">Agreement definition is missing</p>
        <Button onClick={handleNavigateToCreate}>Back to Templates</Button>
      </div>
    );
  }

  const isDraft = draft.status === "Draft";

  return (
    <div className="flex h-screen w-full flex-col items-start overflow-hidden bg-neutral-50">
      {/* ------------------------------------------------------------------ */}
      {/* Page Header (sticky)                                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="sticky top-0 z-20 w-full bg-default-background">
        <PageHeader
          title={configure.agreementName || draft?.displayName || template?.metadata?.name || "Agreement"}
        subtitle=""
        actions={
          <div className="flex items-end gap-3">
            {isDraft && (
              <Button
                variant="neutral-secondary"
                icon={<FeatherTrash2 />}
                onClick={() => setIsDeleteOpen(true)}
              >
                Delete
              </Button>
            )}
            <IconButton
              variant="neutral-secondary"
              icon={<FeatherX />}
              onClick={handleCancel}
            />
          </div>
        }
        tags={
          <>
            <Badge
              className="h-7 w-auto flex-none"
              variant="neutral"
              icon={<FeatherCircleDot />}
            >
              {isDraft ? "Draft" : "Deployed"}
            </Badge>
            <Badge
              className="h-7 w-auto flex-none"
              variant="neutral"
              icon={<FeatherLayoutTemplate />}
              iconRight={null}
            >
              {template.metadata?.name || "Template"}
            </Badge>
            {!isDraft ? (
              <Badge className="h-7 w-auto flex-none" variant="neutral">
                {selectedChainName}
              </Badge>
            ) : null}
            {/* Save status indicators (variables + participants + observers) */}
            {isDraft && (configure.saveStatus === "saving" || configure.participantSaveStatus === "saving" || configure.observersSaveStatus === "saving") && (
              <Badge className="h-7 w-auto flex-none" variant="neutral" icon={<FeatherLoader className="h-3.5 w-3.5 animate-spin" />}>
                Saving…
              </Badge>
            )}
            {isDraft && (configure.saveStatus === "saved" || configure.participantSaveStatus === "saved" || configure.observersSaveStatus === "saved") &&
              configure.saveStatus !== "saving" && configure.participantSaveStatus !== "saving" && configure.observersSaveStatus !== "saving" && (
              <Badge className="h-7 w-auto flex-none" variant="success" icon={<FeatherCheck className="h-3.5 w-3.5" />}>
                Draft saved
              </Badge>
            )}
            {isDraft && (configure.saveStatus === "error" || configure.participantSaveStatus === "error" || configure.observersSaveStatus === "error") &&
              configure.saveStatus !== "saving" && configure.participantSaveStatus !== "saving" && configure.observersSaveStatus !== "saving" && (
              <Badge className="h-7 w-auto flex-none" variant="error">
                Save failed
              </Badge>
            )}
          </>
        }
        controls={
          <div className="flex w-full items-end gap-3 mobile:flex-col mobile:items-stretch">
            {isDraft ? (
              <DeploymentNetworkSelect
                chains={supportedChains}
                selectedChainId={selectedChainId}
                onSelect={(chainId) => void handleDraftChainChange(chainId)}
              />
            ) : null}
            <Segment
              className="w-[640px] flex-none mobile:w-full"
              items={
                <>
                  <Segment.Item
                    icon={<FeatherSliders />}
                    active={activeTab === "configure"}
                    onClick={handleSetActiveTabConfigure}
                  >
                    Configure
                  </Segment.Item>
                  <Segment.Item
                    icon={<FeatherFileText />}
                    active={activeTab === "document"}
                    onClick={handleSetActiveTabDocument}
                  >
                    Document View
                  </Segment.Item>
                  <Segment.Item
                    icon={<FeatherWorkflow />}
                    active={activeTab === "stateMachine"}
                    onClick={handleSetActiveTabStateMachine}
                  >
                    State Machine Map
                  </Segment.Item>
                </>
              }
            />
          </div>
        }
        showTags={true}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab content                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex w-full flex-1 flex-col items-center overflow-y-auto">
        {activeTab === "configure" && (
          <DocumentConfigureTab
            configure={configure}
            showValidation={showValidation}
            onNavigateToStateMachine={handleSetActiveTabStateMachine}
            getDeployConfirmDetails={deploy.getDeployConfirmDetails}
            onConfirmDeploy={(cfg) => deploy.handleConfirmDeploy(cfg)}
            isDeployWorking={deploy.isDeployWorking}
            deployError={deploy.deployError}
            deployErrorReport={deploy.deployErrorReport}
            setDeployError={deploy.setDeployError}
            setDeployErrorReport={deploy.setDeployErrorReport}
            template={template}
          />
        )}

        {activeTab === "document" && (
          <DocumentDocumentTab
            content={template?.content ?? null}
            variables={variables}
            control={control}
            errors={errors || {}}
            userAddress={address || ""}
            initialParams={initialParams}
          />
        )}

        {activeTab === "stateMachine" && (
          <DocumentStateMachineTab agreementJson={agreementJson} template={template} />
        )}

      </div>

      {/* Delete Draft confirmation modal                                     */}
      {/* ------------------------------------------------------------------ */}
      <DialogLayout
        open={isDeleteOpen}
        onOpenChange={handleDeleteDialogChange}
      >
        <div className="flex w-[576px] max-w-full flex-col items-start gap-6 bg-default-background px-6 py-6">
          <div className="flex w-full items-center justify-between">
            <span className="text-heading-1 font-heading-1 text-default-font">
              Delete Draft
            </span>
            <IconButton
              icon={<FeatherX />}
              onClick={handleDeleteModalClose}
            />
          </div>

          <div className="flex w-full flex-col items-start gap-4">
            {/* Warning banner */}
            <div className="flex w-full items-start gap-3 rounded-md bg-error-50 px-4 py-3">
              <FeatherAlertTriangle className="text-body font-body text-error-600 mt-0.5" />
              <div className="flex grow shrink-0 basis-0 flex-col items-start gap-1">
                <span className="text-caption-bold font-caption-bold text-error-800">
                  Warning: Permanent Deletion
                </span>
                <span className="text-caption font-caption text-error-800">
                  Once deleted, this draft and all associated data will be
                  permanently removed and cannot be recovered.
                </span>
              </div>
            </div>

            {/* Agreement summary card */}
            <DisplayCard
              title={configure.agreementName?.trim() || template?.metadata?.name || "Untitled Agreement"}
              content={
              <div className="flex w-full flex-col items-start gap-2 px-4 py-4">
              <Badge
                className="h-4 w-auto flex-none"
                variant="neutral"
                icon={<FeatherLayoutTemplate />}
                iconRight={null}
              >
                {template?.metadata?.name || "Template"}
              </Badge>
              <div className="flex w-full flex-col items-start gap-2 pt-2">
                {draft?.updatedAt && (
                  <div className="flex w-full items-center gap-2">
                    <span className="text-caption font-caption text-subtext-color">
                      Last modified:
                    </span>
                    <span className="text-caption font-caption text-default-font">
                      {new Date(draft.updatedAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                )}
                {draft?.createdAt && (
                  <div className="flex w-full items-center gap-2">
                    <span className="text-caption font-caption text-subtext-color">
                      Created:
                    </span>
                    <span className="text-caption font-caption text-default-font">
                      {new Date(draft.createdAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                )}
              </div>
              </div>
              }
            />
          </div>

          <div className="flex w-full items-center justify-end gap-3">
            <Button
              variant="neutral-tertiary"
              size="large"
              onClick={handleDeleteModalCancel}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive-primary"
              size="large"
              onClick={() => void handleDeleteDraft()}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </DialogLayout>
    </div>
  );
};

export default Document;
