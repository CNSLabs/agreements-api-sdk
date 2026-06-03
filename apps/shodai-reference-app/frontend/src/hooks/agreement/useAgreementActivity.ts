import * as React from "react";
import type { AgreementInputRecordApi, AgreementRecordApi } from "@/hooks/useAgreementsApi";

export interface UseAgreementActivityParams {
  record: AgreementRecordApi | null;
  id: string | undefined;
  getInputs: (id: string) => Promise<AgreementInputRecordApi[]>;
  formatPaymentAmount: (key: string, value: unknown, templateId: string | undefined) => unknown;
}

export function useAgreementActivity({
  record,
  id,
  getInputs,
  formatPaymentAmount,
}: UseAgreementActivityParams) {
  const [activityInputs, setActivityInputs] = React.useState<AgreementInputRecordApi[]>([]);
  const [activityLoading, setActivityLoading] = React.useState(false);
  const [activityError, setActivityError] = React.useState<string | null>(null);

  // Create activity list with initialization event as last item
  const activityWithInit = React.useMemo(() => {
    if (!record) return activityInputs;

    const agreementAddress = record?.address || id || "";
    const initData = (record?.json as any)?.execution?.initialize?.data || {};

    const initValues: Record<string, unknown> = {};
    Object.entries(initData).forEach(([key, value]) => {
      if (typeof value === "string" && value.startsWith("${variables.")) {
        const varMatch = value.match(/\$\{variables\.(\w+)(?:\.value)?\}/);
        if (varMatch) {
          const varKey = varMatch[1];
          const varValue = record?.variables?.[varKey];
          initValues[key] = varValue !== undefined ? varValue : varKey;
        }
      } else {
        initValues[key] = value;
      }
    });

    const initEvent: AgreementInputRecordApi = {
      inputId: "__initialization__",
      createdAt: record?.createdAt,
      values: initValues,
      agreementAddress,
      chainId: 0,
      txHash: "",
      payload: "",
      status: "accepted",
    };

    return [...activityInputs, initEvent];
  }, [activityInputs, record, id]);

  const refreshInputs = React.useCallback(async () => {
    const inputsId = record?.address || id || "";
    if (!inputsId) return;
    setActivityError(null);
    setActivityLoading(true);
    try {
      const json = await getInputs(inputsId);

      const templateId =
        (record?.json as any)?.metadata?.templateId || (record?.json as any)?.metadata?.id;

      const formatted = (json || []).map((input) => {
        if (input.values) {
          const formattedValues: Record<string, any> = {};
          Object.entries(input.values).forEach(([key, value]) => {
            formattedValues[key] = formatPaymentAmount(key, value, templateId);
          });
          return { ...input, values: formattedValues };
        }
        return input;
      });

      const sorted = formatted.sort((a, b) => {
        const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (tb !== ta) return tb - ta;
        const ba = typeof a?.blockNumber === "number" ? a.blockNumber : 0;
        const bb = typeof b?.blockNumber === "number" ? b.blockNumber : 0;
        return bb - ba;
      });
      setActivityInputs(sorted);
    } finally {
      setActivityLoading(false);
    }
  }, [record?.address, id, record?.json, getInputs, formatPaymentAmount]);

  return {
    activityInputs,
    activityWithInit,
    activityLoading,
    activityError,
    refreshInputs,
    setActivityError,
  };
}
