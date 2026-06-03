import axios from "axios";
import { useCallback } from "react";
import { createBrowserTelemetryHeaders } from "@/lib/telemetry";

const AGREEMENTS_API_URL = import.meta.env.VITE_AGREEMENTS_API_BASE_URL || "";
const AGREEMENTS_API_BASE = `${AGREEMENTS_API_URL}/agreements-api`;

export interface AgreementTemplateAssets {
  thumbnailUrl: string;
  pdfUrl: string;
}

export interface AgreementTemplateMetadata {
  id: string;
  templateId: string;
  version: string;
  createdAt: string;
  name: string;
  author: string;
  description: string;
  assets: AgreementTemplateAssets;
}

export interface AgreementTemplate {
  metadata: AgreementTemplateMetadata;
  [key: string]: any;
}

async function apiCall<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}

export function useTemplatesApi() {
  const listTemplates = useCallback(async (): Promise<AgreementTemplateMetadata[]> => {
    return apiCall(async () => {
      const res = await axios.get<AgreementTemplateMetadata[]>(`${AGREEMENTS_API_BASE}/templates`, {
        headers: createBrowserTelemetryHeaders(),
      });
      return res.data;
    });
  }, []);

  const getTemplateById = useCallback(async (templateId: string): Promise<AgreementTemplate> => {
    return apiCall(async () => {
      const res = await axios.get<AgreementTemplate>(
        `${AGREEMENTS_API_BASE}/templates/${encodeURIComponent(templateId)}`,
        {
          headers: createBrowserTelemetryHeaders(),
        },
      );
      return res.data;
    });
  }, []);

  return { listTemplates, getTemplateById };
}
