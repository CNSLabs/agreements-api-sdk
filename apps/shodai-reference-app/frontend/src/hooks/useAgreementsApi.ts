import { useCallback } from "react";
import { useLogin } from "@/hooks/useLogin";
import { createAuthenticatedAxiosInstance } from "@/lib/apiClient";

const AGREEMENTS_API_URL = import.meta.env.VITE_AGREEMENTS_API_BASE_URL || "";
const AGREEMENTS_API_BASE = `${AGREEMENTS_API_URL}/agreements-api`;

export type PermitSignature = { v: number; r: string; s: string };

export type AgreementStatus = "Draft" | "Deployed";

export type AgreementRecordApi = {
  /** Server-generated UUID (stable across Draft → Deployed). */
  id: string;
  /** On-chain clone address. Only present after deployment. */
  address?: string;
  /** Lifecycle status. */
  status: AgreementStatus;
  chainId?: number;
  json?: unknown;
  state?: string;
  variables?: Record<string, unknown>;
  updatedAt?: string;
  createdAt?: string;
  displayName?: string;
  owner?: string;
  docUri?: string;
  lastInputId?: string;
  lastInputAt?: string;
  participants?: ParticipantApi[];
  observers?: string[];
};

export type ParticipantApi = {
  variableKey: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  walletAddress?: string;
  status?: "pending" | "invited" | "accepted";
};

export type GetParticipantsResponse = {
  participants: ParticipantApi[];
  participantVariableKeys: string[];
};

export type GetObserversResponse = {
  observers: string[];
};

export type AvailableTemplateAccessResponse = {
  defaultTemplateIds: string[];
  whitelistedTemplateIds: string[];
};

export type AgreementInputRecordApi = {
  agreementAddress: string;
  chainId: number;
  inputId: string;
  userId?: string;
  txHash: string;
  blockNumber?: number;
  payload: string;
  values: Record<string, unknown>;
  status: "PENDING" | "MINED" | "FAILED" | string;
  createdAt?: string;
  updatedAt?: string;
};

async function apiCall<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}

export function useAgreementsApi() {
  const { getAuthToken } = useLogin();

  const createInstance = useCallback(
    () => createAuthenticatedAxiosInstance(getAuthToken, AGREEMENTS_API_BASE),
    [getAuthToken]
  );

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  /**
   * Template IDs the current user can use for agreement creation, split by
   * default access vs user-specific whitelist access.
   */
  const getAvailableTemplateIds = useCallback(
    async (): Promise<AvailableTemplateAccessResponse> => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.get<AvailableTemplateAccessResponse>(
          "/agreements/templates/available",
        );
        return res.data;
      });
    },
    [createInstance],
  );

  const listAgreements = useCallback(
    async (params?: { status?: AgreementStatus }) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const qp: Record<string, string> = {};
        if (params?.status) qp.status = params.status;
        const res = await axiosInstance.get<AgreementRecordApi[]>("/agreements", {
          params: Object.keys(qp).length ? qp : undefined,
        });
        return res.data;
      });
    },
    [createInstance],
  );

  const getAgreement = useCallback(
    async (id: string) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.get<AgreementRecordApi>(`/agreements/${id}`);
        return res.data;
      });
    },
    [createInstance],
  );

  const getState = useCallback(
    async (id: string) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.get<{ status?: string; state?: string }>(`/agreements/${id}/state`);
        return res.data;
      });
    },
    [createInstance],
  );

  const getInputs = useCallback(
    async (id: string, params?: { userId?: string }) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.get<AgreementInputRecordApi[]>(`/agreements/${id}/inputs`, {
          params: params?.userId ? { userId: params.userId } : undefined,
        });
        return res.data;
      });
    },
    [createInstance],
  );

  // ---------------------------------------------------------------------------
  // Input submission (Deployed agreements only)
  // ---------------------------------------------------------------------------

  const processInput = useCallback(
    async (
      id: string,
      body: {
        inputId: string;
        values: Record<string, unknown>;
        signer: string;
        deadline: number;
        signature: PermitSignature;
      },
    ) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.post<AgreementInputRecordApi>(`/agreements/${id}/input`, body);
        return res.data;
      });
    },
    [createInstance],
  );

  // ---------------------------------------------------------------------------
  // Draft lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Create a new agreement in Draft status.
   * Returns the draft record with a server-generated UUID as `id`.
   */
  const createDraftAgreement = useCallback(
    async (body: {
      templateId: string;
      displayName?: string;
      chainId: number;
      docUri?: string;
      initValues?: Record<string, unknown>;
    }) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.post<AgreementRecordApi>("/agreements", body);
        return res.data;
      });
    },
    [createInstance],
  );

  /**
   * Progressively update init values on a Draft agreement.
   * Values are shallow-merged server-side.
   */
  const updateDraftValues = useCallback(
    async (id: string, values: Record<string, unknown>) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.patch<AgreementRecordApi>(`/agreements/${id}/values`, { values });
        return res.data;
      });
    },
    [createInstance],
  );

  /**
   * Update the displayName of a Draft agreement.
   */
  const updateDraftDisplayName = useCallback(
    async (id: string, displayName: string) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.patch<AgreementRecordApi>(`/agreements/${id}/display-name`, { displayName });
        return res.data;
      });
    },
    [createInstance],
  );

  const updateDraftChainId = useCallback(
    async (id: string, chainId: number) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.patch<AgreementRecordApi>(`/agreements/${id}/chain`, { chainId });
        return res.data;
      });
    },
    [createInstance],
  );

  /**
   * Deploy a Draft agreement on-chain using a signer permit (EIP-712).
   */
  const deployAgreementWithPermit = useCallback(
    async (
      id: string,
      body: {
        signer: string;
        deadline: number;
        signature: PermitSignature;
        docUri?: string;
      },
    ) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.post<AgreementRecordApi>(`/agreements/${id}/deploy-with-permit`, body);
        return res.data;
      });
    },
    [createInstance],
  );

  /**
   * Delete a Draft agreement. Only the owner can delete their own draft.
   */
  const deleteDraft = useCallback(
    async (id: string) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.delete<{ ok: true }>(`/agreements/${id}`);
        return res.data;
      });
    },
    [createInstance],
  );

  // ---------------------------------------------------------------------------
  // Participants (Draft agreements only)
  // ---------------------------------------------------------------------------

  /**
   * Replace the full participants list on a Draft agreement.
   * When resolveWallets is true, the backend resolves participant wallet addresses from email via auth-api.
   */
  const setParticipants = useCallback(
    async (id: string, participants: ParticipantApi[], options?: { resolveWallets?: boolean }) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.put<AgreementRecordApi>(`/agreements/${id}/participants`, {
          participants,
          resolveWallets: options?.resolveWallets === true,
        });
        return res.data;
      });
    },
    [createInstance],
  );

  /**
   * Get participants and participant variable keys for a Draft agreement.
   */
  const getParticipants = useCallback(
    async (id: string) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.get<GetParticipantsResponse>(`/agreements/${id}/participants`);
        return res.data;
      });
    },
    [createInstance],
  );

  // ---------------------------------------------------------------------------
  // Observers (Draft agreements only)
  // ---------------------------------------------------------------------------

  /**
   * Replace the full observers list on a Draft agreement.
   */
  const setObservers = useCallback(
    async (id: string, observers: string[]) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.put<AgreementRecordApi>(`/agreements/${id}/observers`, {
          observers,
        });
        return res.data;
      });
    },
    [createInstance],
  );

  /**
   * Get observers for a Draft agreement.
   */
  const getObservers = useCallback(
    async (id: string) => {
      return apiCall(async () => {
        const axiosInstance = await createInstance();
        const res = await axiosInstance.get<GetObserversResponse>(`/agreements/${id}/observers`);
        return res.data;
      });
    },
    [createInstance],
  );

  return {
    // escape hatch (for one-off endpoints)
    createAuthenticatedAxiosInstance: createInstance,
    // read
    getAvailableTemplateIds,
    listAgreements,
    getAgreement,
    getState,
    getInputs,
    // input submission
    processInput,
    // draft lifecycle
    createDraftAgreement,
    updateDraftValues,
    updateDraftDisplayName,
    updateDraftChainId,
    deployAgreementWithPermit,
    deleteDraft,
    // participants
    setParticipants,
    getParticipants,
    // observers
    setObservers,
    getObservers,
  };
}
