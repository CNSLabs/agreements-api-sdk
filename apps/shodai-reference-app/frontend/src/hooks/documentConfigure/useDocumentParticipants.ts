import * as React from "react";
import type { AgreementRecordApi, ParticipantApi } from "@/hooks/useAgreementsApi";
import type { ParticipantFormEntry, SaveStatus } from "./types";
import { looksLikeEmail } from "@/utils/validation";

export interface UseDocumentParticipantsParams {
  draft: AgreementRecordApi | null;
  draftId: string | undefined;
  participantKeys: string[];
  isWorking: boolean;
  getParticipants: (draftId: string) => Promise<{ participants: ParticipantApi[] }>;
  setParticipants: (draftId: string, participants: ParticipantApi[]) => Promise<unknown>;
}

export function useDocumentParticipants({
  draft,
  draftId,
  participantKeys,
  isWorking,
  getParticipants,
  setParticipants,
}: UseDocumentParticipantsParams) {
  const [participantsMap, setParticipantsMap] = React.useState<Record<string, ParticipantFormEntry>>({});
  const [touchedParticipantFields, setTouchedParticipantFields] = React.useState<
    Record<string, { firstName?: boolean; lastName?: boolean; email?: boolean }>
  >({});
  const [participantSaveStatus, setParticipantSaveStatus] = React.useState<SaveStatus>("idle");
  const draftStatus = draft?.status;

  React.useEffect(() => {
    if (!draftId || draftStatus !== "Draft") return;
    let cancelled = false;
    getParticipants(draftId)
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, ParticipantFormEntry> = {};
        for (const p of res.participants || []) {
          map[p.variableKey] = {
            firstName: p.firstName || "",
            lastName: p.lastName || "",
            email: p.email || "",
          };
        }
        setParticipantsMap(map);
      })
      .catch((e: unknown) => {
        console.error("Failed to load participants for draft:", e);
      });
    return () => {
      cancelled = true;
    };
  }, [draftId, draftStatus, getParticipants]);

  React.useEffect(() => {
    if (!draftId) setTouchedParticipantFields({});
  }, [draftId]);

  const updateParticipantField = React.useCallback(
    (variableKey: string, field: keyof ParticipantFormEntry, value: string) => {
      setParticipantsMap((prev) => {
        const existing = prev[variableKey] || { firstName: "", lastName: "", email: "" };
        return { ...prev, [variableKey]: { ...existing, [field]: value } };
      });
    },
    []
  );

  const handleSaveParticipants = React.useCallback(async () => {
    if (!draftId || !draft || draft.status !== "Draft" || isWorking) return;
    const participants: ParticipantApi[] = participantKeys.map((k) => {
      const entry = participantsMap[k] || { firstName: "", lastName: "", email: "" };
      return {
        variableKey: k,
        firstName: entry.firstName || undefined,
        lastName: entry.lastName || undefined,
        email: entry.email && looksLikeEmail(entry.email) ? entry.email : undefined,
      };
    });
    setParticipantSaveStatus("saving");
    try {
      await setParticipants(draftId, participants);
      setParticipantSaveStatus("saved");
      setTimeout(() => setParticipantSaveStatus((prev) => (prev === "saved" ? "idle" : prev)), 3000);
    } catch {
      setParticipantSaveStatus("error");
    }
  }, [draft, draftId, participantKeys, participantsMap, setParticipants, isWorking]);

  const participantErrors = React.useMemo(() => {
    const errs: Record<string, { firstName?: string; lastName?: string; email?: string }> = {};
    for (const k of participantKeys) {
      const p = participantsMap[k];
      const fieldErrs: { firstName?: string; lastName?: string; email?: string } = {};
      if (!p?.firstName?.trim()) fieldErrs.firstName = "Required";
      if (!p?.lastName?.trim()) fieldErrs.lastName = "Required";
      if (!p?.email?.trim()) {
        fieldErrs.email = "Required";
      } else if (!looksLikeEmail(p.email.trim())) {
        fieldErrs.email = "Invalid email";
      }
      errs[k] = fieldErrs;
    }
    return errs;
  }, [participantKeys, participantsMap]);

  const createParticipantFieldHandler = React.useCallback(
    (variableKey: string, field: keyof ParticipantFormEntry) => {
      return (e: React.ChangeEvent<HTMLInputElement>) => {
        updateParticipantField(variableKey, field, e.target.value);
      };
    },
    [updateParticipantField]
  );

  const createParticipantFieldBlurHandler = React.useCallback(
    (variableKey: string, field: keyof ParticipantFormEntry) => {
      return () => {
        setTouchedParticipantFields((prev) => ({
          ...prev,
          [variableKey]: { ...prev[variableKey], [field]: true },
        }));
        if (draft?.status === "Draft" && !isWorking) {
          void handleSaveParticipants();
        }
      };
    },
    [draft?.status, handleSaveParticipants, isWorking]
  );

  return {
    participantsMap,
    touchedParticipantFields,
    participantErrors,
    participantSaveStatus,
    createParticipantFieldHandler,
    createParticipantFieldBlurHandler,
  };
}
