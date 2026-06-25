import { useCallback } from "react";
import { useLogin } from "@/hooks/useLogin";
import { createAuthenticatedAxiosInstance } from "@/lib/apiClient";

const AGREEMENTS_API_URL = import.meta.env.VITE_AGREEMENTS_API_BASE_URL || "";
const AGREEMENTS_API_BASE = `${AGREEMENTS_API_URL}/agreements-api`;

export interface NotificationTemplate {
  metadata: {
    id: string;
    agreementTemplateId: string;
    version: string;
    name?: string;
    description?: string;
  };
  rules: NotificationRule[];
}

export interface NotificationRule {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  trigger: TransitionTrigger | TemporalTrigger;
  recipients: string[];
  notification: NotificationContent;
  constraints?: {
    maxOccurrences?: number;
  };
}

export interface TransitionTrigger {
  type: "onTransition";
  inputs?: string[];
  from?: string[];
  to?: string[];
}

export interface TemporalTrigger {
  type: "temporal";
  states: string[];
  condition: TemporalCondition;
  fireOnce?: boolean;
  checkInterval?: {
    value: number;
    unit: "seconds" | "minutes" | "hours" | "days" | "weeks";
  };
}

export interface TemporalCondition {
  type: "elapsedSinceVariable" | "stateAge" | "deadlineApproaching";
  variable?: string;
  threshold: {
    value: number;
    unit: "seconds" | "minutes" | "hours" | "days" | "weeks";
  };
}

export interface NotificationContent {
  channel?: "email" | "external_webhook";
  subject: string;
  title?: string;
  body: string;
  ctaLabel?: string;
  attachmentStrategy?: NotificationAttachmentStrategy;
}

export type NotificationAttachmentStrategy = {
  type: "customerInvoicePdf";
  variant: string;
};

export function useNotificationsApi() {
  const { getAuthToken } = useLogin();

  const createInstance = useCallback(
    () => createAuthenticatedAxiosInstance(getAuthToken, AGREEMENTS_API_BASE),
    [getAuthToken]
  );

  const getTemplateByAgreementTemplateId = useCallback(
    async (agreementTemplateId: string): Promise<NotificationTemplate | null> => {
      const axiosInstance = await createInstance();
      try {
        const res = await axiosInstance.get<NotificationTemplate>(
          `/notifications/templates/by-agreement-template/${encodeURIComponent(agreementTemplateId)}`
        );
        return res.data;
      } catch (error: any) {
        if (error?.response?.status === 404) return null;
        throw error;
      }
    },
    [createInstance]
  );

  return {
    getTemplateByAgreementTemplateId,
  };
}
