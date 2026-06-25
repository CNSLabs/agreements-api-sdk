import * as React from "react";
import type { AgreementRecordApi } from "@/hooks/useAgreementsApi";
import type { SaveStatus } from "./types";

export interface UseDocumentAgreementNameParams {
  draft: AgreementRecordApi | null;
  draftId: string | undefined;
  template: any;
  updateDraftDisplayName: (draftId: string, displayName: string) => Promise<AgreementRecordApi>;
  onDraftUpdated?: (record: AgreementRecordApi) => void;
  setSaveStatus: React.Dispatch<React.SetStateAction<SaveStatus>>;
}

export function useDocumentAgreementName({
  draft,
  draftId,
  template,
  updateDraftDisplayName,
  onDraftUpdated,
  setSaveStatus,
}: UseDocumentAgreementNameParams) {
  const [agreementName, setAgreementName] = React.useState("");
  const draftRecordId = draft?.id ?? null;
  const draftDisplayName = draft?.displayName ?? "";

  React.useEffect(() => {
    if (!draftRecordId) return;
    setAgreementName(draftDisplayName);
  }, [draftRecordId, draftDisplayName]);

  const handleSaveAgreementName = React.useCallback(async () => {
    if (!draftId || !draft || draft.status !== "Draft") return;
    const nameToSave = agreementName.trim() || (template?.metadata?.name || "");
    if (!agreementName.trim() && template?.metadata?.name) {
      setAgreementName(template.metadata.name);
    }
    setSaveStatus("saving");
    try {
      const updated = await updateDraftDisplayName(draftId, nameToSave);
      onDraftUpdated?.(updated);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus((prev) => (prev === "saved" ? "idle" : prev)), 3000);
    } catch {
      setSaveStatus("error");
    }
  }, [agreementName, draft, draftId, template, updateDraftDisplayName, onDraftUpdated, setSaveStatus]);

  const onNameChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAgreementName(e.target.value);
  }, []);

  const onNameBlur = React.useCallback(() => {
    void handleSaveAgreementName();
  }, [handleSaveAgreementName]);

  return { agreementName, onNameChange, onNameBlur };
}
