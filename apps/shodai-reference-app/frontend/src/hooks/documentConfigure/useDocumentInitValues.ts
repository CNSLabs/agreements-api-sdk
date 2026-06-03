import * as React from "react";
import type { UseFormReturn } from "react-hook-form";
import type { AgreementRecordApi } from "@/hooks/useAgreementsApi";
import type { SaveStatus } from "./types";
import { getInitFieldErrors } from "./initFieldValidation";

export interface UseDocumentInitValuesParams {
  draft: AgreementRecordApi | null;
  draftId: string | undefined;
  template: any;
  form: UseFormReturn<Record<string, any>>;
  initKeys: string[];
  nonParticipantKeys: string[];
  initValuesMap: Record<string, string>;
  isWorking: boolean;
  updateDraftValues: (draftId: string, values: Record<string, unknown>) => Promise<AgreementRecordApi>;
  onDraftUpdated?: (record: AgreementRecordApi) => void;
  setSaveStatus: React.Dispatch<React.SetStateAction<SaveStatus>>;
}

export function useDocumentInitValues({
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
}: UseDocumentInitValuesParams) {
  const [touchedInitFields, setTouchedInitFields] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    if (!draftId) setTouchedInitFields({});
  }, [draftId]);

  const handleSaveDraftValues = React.useCallback(async () => {
    if (!draftId || !draft || draft.status !== "Draft" || isWorking) return;
    const values = form.getValues() as Record<string, any>;
    const toSave: Record<string, unknown> = {};
    for (const k of initKeys) {
      const v = values[k];
      if (v != null && v !== "") toSave[k] = v;
    }
    if (Object.keys(toSave).length === 0) return;
    setSaveStatus("saving");
    try {
      const updated = await updateDraftValues(draftId, toSave);
      onDraftUpdated?.(updated);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus((prev) => (prev === "saved" ? "idle" : prev)), 3000);
    } catch {
      setSaveStatus("error");
    }
  }, [draft, draftId, form, initKeys, updateDraftValues, isWorking, onDraftUpdated, setSaveStatus]);

  const initFieldErrors = React.useMemo(() => {
    return getInitFieldErrors({
      fieldKeys: nonParticipantKeys,
      values: initValuesMap,
      variables: ((template as any)?.variables || {}) as Record<string, unknown> as Record<string, {
        type?: string;
        subType?: string;
      }>,
    });
  }, [nonParticipantKeys, initValuesMap, template]);

  const createVariableFieldHandler = React.useCallback(
    (fieldKey: string) => {
      return (value: string) => {
        form.setValue(fieldKey, value, { shouldValidate: true });
      };
    },
    [form]
  );

  const createVariableFieldBlurHandler = React.useCallback(
    (fieldKey: string) => {
      return () => {
        setTouchedInitFields((prev) => ({ ...prev, [fieldKey]: true }));
        if (draft?.status === "Draft" && !isWorking) {
          void handleSaveDraftValues();
        }
      };
    },
    [draft?.status, handleSaveDraftValues, isWorking]
  );

  return {
    touchedInitFields,
    initFieldErrors,
    createVariableFieldHandler,
    createVariableFieldBlurHandler,
  };
}
