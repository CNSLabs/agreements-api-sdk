import { isAddress } from "viem";

import { isOnchainReferenceSubType, validateOnchainReferenceValue } from "../../utils/onchainReferences.ts";

type InitVariableLike = {
  type?: string;
  subType?: string;
};

interface GetInitFieldErrorsParams {
  fieldKeys: string[];
  values: Record<string, unknown>;
  variables: Record<string, InitVariableLike>;
}

export function getInitFieldErrors({
  fieldKeys,
  values,
  variables,
}: GetInitFieldErrorsParams): Record<string, string | null> {
  const errs: Record<string, string | null> = {};

  for (const fieldKey of fieldKeys) {
    const raw = values[fieldKey];
    const value = typeof raw === "string" ? raw.trim() : raw;
    const variable = variables[fieldKey];

    if (!value) {
      errs[fieldKey] = "Required";
      continue;
    }

    if (isOnchainReferenceSubType(variable?.subType)) {
      const validationResult = validateOnchainReferenceValue(variable as any, String(value));
      errs[fieldKey] = validationResult === true ? null : validationResult;
      continue;
    }

    if (variable?.type === "address" && typeof value === "string" && !isAddress(value)) {
      errs[fieldKey] = "Invalid address";
      continue;
    }

    if (variable?.type === "dateTime" && typeof value === "string") {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        errs[fieldKey] = "Invalid date";
        continue;
      }
    }

    errs[fieldKey] = null;
  }

  return errs;
}
