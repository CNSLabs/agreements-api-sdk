import * as React from "react";
import type { AgreementRecordApi } from "@/hooks/useAgreementsApi";
import type { SaveStatus } from "./types";
import { looksLikeEmail } from "@/utils/validation";

export interface UseDocumentObserversParams {
  draft: AgreementRecordApi | null;
  draftId: string | undefined;
  isWorking: boolean;
  setObserversApi: (draftId: string, observers: string[]) => Promise<unknown>;
}

export function useDocumentObservers({
  draft,
  draftId,
  isWorking,
  setObserversApi,
}: UseDocumentObserversParams) {
  const [observersInput, setObserversInput] = React.useState("");
  const [observersSaveStatus, setObserversSaveStatus] = React.useState<SaveStatus>("idle");
  const draftRecordId = draft?.id ?? null;
  const draftObserversInput = Array.isArray(draft?.observers) && draft.observers.length > 0
    ? draft.observers.join(", ")
    : "";

  React.useEffect(() => {
    if (!draftRecordId) return;
    setObserversInput(draftObserversInput);
  }, [draftRecordId, draftObserversInput]);

  const handleSaveObservers = React.useCallback(async () => {
    if (!draftId || !draft || draft.status !== "Draft" || isWorking) return;
    const validObservers = observersInput
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e && looksLikeEmail(e));
    setObserversSaveStatus("saving");
    try {
      await setObserversApi(draftId, validObservers);
      setObserversSaveStatus("saved");
      setTimeout(() => setObserversSaveStatus((prev) => (prev === "saved" ? "idle" : prev)), 3000);
    } catch {
      setObserversSaveStatus("error");
    }
  }, [draft, draftId, observersInput, setObserversApi, isWorking]);

  const observerError = React.useMemo(() => {
    if (!observersInput.trim()) return null;
    const emails = observersInput
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const invalidEmails = emails.filter((e) => !looksLikeEmail(e));
    if (invalidEmails.length > 0) {
      return `Invalid email${invalidEmails.length > 1 ? "s" : ""}: ${invalidEmails.join(", ")}`;
    }
    return null;
  }, [observersInput]);

  const onObserversInputChange = React.useCallback((value: string) => {
    setObserversInput(value);
  }, []);

  return {
    observersInput,
    onObserversInputChange,
    onSaveObservers: handleSaveObservers,
    observerError,
    observersSaveStatus,
  };
}
