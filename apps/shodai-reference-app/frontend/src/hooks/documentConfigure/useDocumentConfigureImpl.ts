import * as React from "react";
import type { UseFormReturn } from "react-hook-form";
import type { AgreementRecordApi, ParticipantApi } from "@/hooks/useAgreementsApi";
import type { DocumentConfigureViewModel, DocumentVariable, DeployValidationError } from "./types";
import { useDocumentAgreementName } from "./useDocumentAgreementName";
import { useDocumentParticipants } from "./useDocumentParticipants";
import { useDocumentObservers } from "./useDocumentObservers";
import { useDocumentInitValues } from "./useDocumentInitValues";

export interface UseDocumentConfigureParams {
  draft: AgreementRecordApi | null;
  draftId: string | undefined;
  template: any;
  initKeys: string[];
  variables: Record<string, DocumentVariable>;
  participantKeys: string[];
  nonParticipantKeys: string[];
  participantInputs: Record<string, { inputId: string; label: string }[]>;
  form: UseFormReturn<Record<string, any>>;
  initValuesMap: Record<string, string>;
  isWorking: boolean;
  setShowValidation: (v: boolean) => void;
  updateDraftValues: (draftId: string, values: Record<string, unknown>) => Promise<AgreementRecordApi>;
  updateDraftDisplayName: (draftId: string, displayName: string) => Promise<AgreementRecordApi>;
  setParticipants: (draftId: string, participants: ParticipantApi[]) => Promise<unknown>;
  getParticipants: (draftId: string) => Promise<{ participants: ParticipantApi[] }>;
  setObserversApi: (draftId: string, observers: string[]) => Promise<unknown>;
  onDraftUpdated?: (record: AgreementRecordApi) => void;
  address: string | undefined;
  hasWallet: boolean;
}

export function useDocumentConfigure({
  draft,
  draftId,
  template,
  initKeys,
  variables,
  participantKeys,
  nonParticipantKeys,
  participantInputs,
  form,
  initValuesMap,
  isWorking,
  setShowValidation,
  updateDraftValues,
  updateDraftDisplayName,
  setParticipants,
  getParticipants,
  setObserversApi,
  onDraftUpdated,
  address,
  hasWallet,
}: UseDocumentConfigureParams): DocumentConfigureViewModel {
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "saved" | "error">("idle");

  const agreementNameState = useDocumentAgreementName({
    draft,
    draftId,
    template,
    updateDraftDisplayName,
    onDraftUpdated,
    setSaveStatus,
  });

  const participantsState = useDocumentParticipants({
    draft,
    draftId,
    participantKeys,
    isWorking,
    getParticipants,
    setParticipants,
  });

  const observersState = useDocumentObservers({
    draft,
    draftId,
    isWorking,
    setObserversApi,
  });

  const initValuesState = useDocumentInitValues({
    draft,
    draftId,
    template,
    form,
    initKeys,
    nonParticipantKeys,
    initValuesMap,
    isWorking,
    updateDraftValues,
    onDraftUpdated,
    setSaveStatus,
  });

  const hasParticipantErrors = React.useMemo(
    () =>
      Object.values(participantsState.participantErrors).some(
        (e) => !!(e.firstName || e.lastName || e.email || e.walletAddress)
      ),
    [participantsState.participantErrors]
  );

  const canClickDeploy = React.useMemo(() => {
    if (!hasWallet) return false;
    if (isWorking) return false;
    if (draft?.status !== "Draft") return false;
    if (draft?.owner && address && draft.owner.toLowerCase() !== address.toLowerCase()) return false;
    if (
      nonParticipantKeys.length > 0 &&
      Object.values(initValuesState.initFieldErrors).some((x) => !!x)
    )
      return false;
    if (hasParticipantErrors) return false;
    return true;
  }, [
    address,
    draft?.status,
    draft?.owner,
    hasParticipantErrors,
    initValuesState.initFieldErrors,
    nonParticipantKeys.length,
    isWorking,
    hasWallet,
  ]);

  const onDeployClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!template) return;
      if (!canClickDeploy) {
        setShowValidation(true);
      }
    },
    [template, canClickDeploy, setShowValidation]
  );

  const getDeployValidationError = React.useCallback((): DeployValidationError | null => {
    if (isWorking) return null;
    if (draft?.status !== "Draft") return null;

    // Permission: not owner
    if (draft?.owner && address && draft.owner.toLowerCase() !== address.toLowerCase()) {
      return {
        type: "permission",
        errorCount: 1,
        title: "You are not the owner",
        description: "Only the owner of this draft can deploy the agreement.",
        showReviewButton: false,
      };
    }

    // Unexpected: no wallet
    if (!hasWallet) {
      return {
        type: "unexpected",
        errorCount: 1,
        title: "Wallet not connected",
        description: "Please connect your wallet to deploy the agreement.",
        showReviewButton: false,
      };
    }

    // Form validation errors (fixable)
    let count = 0;
    if (!agreementNameState.agreementName.trim()) count += 1;
    const initErrCount = Object.values(initValuesState.initFieldErrors).filter((x) => !!x).length;
    count += initErrCount;
    const participantErrCount = Object.values(participantsState.participantErrors).reduce(
      (sum, e) => sum + (e.firstName ? 1 : 0) + (e.lastName ? 1 : 0) + (e.email ? 1 : 0) + (e.walletAddress ? 1 : 0),
      0
    );
    count += participantErrCount;

    if (count > 0) {
      return {
        type: "form",
        errorCount: count,
        title: `${count} validation error${count !== 1 ? "s" : ""} to be resolved`,
        description: "Please review and fix the errors in the form before deploying the agreement.",
        showReviewButton: true,
      };
    }

    return null;
  }, [
    isWorking,
    draft?.status,
    draft?.owner,
    address,
    hasWallet,
    agreementNameState.agreementName,
    initValuesState.initFieldErrors,
    participantsState.participantErrors,
  ]);

  return {
    agreementName: agreementNameState.agreementName,
    onNameChange: agreementNameState.onNameChange,
    onNameBlur: agreementNameState.onNameBlur,
    participantKeys,
    participantsMap: participantsState.participantsMap,
    nonParticipantKeys,
    variables,
    participantInputs,
    participantErrors: participantsState.participantErrors,
    touchedParticipantFields: participantsState.touchedParticipantFields,
    touchedInitFields: initValuesState.touchedInitFields,
    initFieldErrors: initValuesState.initFieldErrors,
    initValuesMap,
    createParticipantFieldHandler: participantsState.createParticipantFieldHandler,
    createParticipantFieldBlurHandler: participantsState.createParticipantFieldBlurHandler,
    createVariableFieldHandler: initValuesState.createVariableFieldHandler,
    createVariableFieldBlurHandler: initValuesState.createVariableFieldBlurHandler,
    observersInput: observersState.observersInput,
    onObserversInputChange: observersState.onObserversInputChange,
    onSaveObservers: observersState.onSaveObservers,
    observerError: observersState.observerError,
    canClickDeploy,
    isWorking,
    isDraft: draft?.status === "Draft",
    onDeployClick,
    getDeployValidationError,
    saveStatus,
    participantSaveStatus: participantsState.participantSaveStatus,
    observersSaveStatus: observersState.observersSaveStatus,
  };
}
