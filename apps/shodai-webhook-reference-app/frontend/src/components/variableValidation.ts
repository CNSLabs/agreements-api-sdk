import { isAddress } from "viem";

import { isOnchainReferenceSubType, validateOnchainReferenceValue } from "../utils/onchainReferences.ts";

export interface ValidatedDocumentVariable {
  type: "string" | "number" | "boolean" | "address" | "dateTime" | "signature" | "txHash";
  subType?: "longText" | "markdown" | "participant" | "signature" | "caip2Chain" | "caip10Account" | "caip19Asset" | string;
  name: string;
  description?: string;
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

export const createValidationRules = (variable: ValidatedDocumentVariable) => {
  const rules: Record<string, any> = {
    required: variable.validation?.required ? `${variable.name} is required` : false,
  };

  rules.validate = (value: string) => {
    if (!value) {
      return rules.required || true;
    }

    if (isOnchainReferenceSubType(variable.subType)) {
      return validateOnchainReferenceValue(variable, value);
    }

    if (variable.type === "address" && !isAddress(value)) {
      return "Invalid Ethereum address";
    }

    if (variable.type === "dateTime") {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        return "Invalid date";
      }
    }

    const { validation } = variable;
    if (!validation) return true;

    if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
      return `Invalid ${variable.name.toLowerCase()} format`;
    }

    if (validation.minLength && value.length < validation.minLength) {
      return `${variable.name} must be at least ${validation.minLength} characters`;
    }

    if (validation.min) {
      const numValue = Number(value);
      if (!isNaN(numValue) && numValue < validation.min) {
        return `${variable.name} must be at least ${validation.min}`;
      }
    }

    if (validation.enum && !validation.enum.includes(value)) {
      return `${variable.name} must be one of: ${validation.enum.join(", ")}`;
    }

    return true;
  };

  return rules;
};
