export type NormalizedInputDataEntry =
  | {
      payloadKey: string;
      kind: "constant";
      value: unknown;
    }
  | {
      payloadKey: string;
      kind: "form";
      formKey: string;
      required: boolean;
    };

type VariableDefinitionLike = {
  validation?: { required?: boolean };
};

function parseVariableReference(value: string): string | null {
  const match = value.match(/^\$\{variables\.(\w+)(?:\.value)?\}$/);
  return match?.[1] ?? null;
}

export function isBlankFormValue(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function resolveVariableReferenceRequired(
  formKey: string,
  variableDefinitions: Record<string, VariableDefinitionLike>,
): boolean {
  return variableDefinitions[formKey]?.validation?.required !== false;
}

export function normalizeInputDataEntries(
  data: Record<string, unknown>,
  variableDefinitions: Record<string, VariableDefinitionLike> = {},
): NormalizedInputDataEntry[] {
  return Object.entries(data).map(([payloadKey, rawValue]) => {
    if (typeof rawValue === "boolean" || typeof rawValue === "number") {
      return { payloadKey, kind: "constant", value: rawValue };
    }

    if (typeof rawValue === "string") {
      const formKey = parseVariableReference(rawValue);
      if (formKey) {
        return {
          payloadKey,
          kind: "form",
          formKey,
          required: resolveVariableReferenceRequired(formKey, variableDefinitions),
        };
      }
      return { payloadKey, kind: "constant", value: rawValue };
    }

    if (typeof rawValue === "object" && rawValue !== null && !Array.isArray(rawValue)) {
      const fieldDef = rawValue as {
        required?: boolean;
        validation?: { required?: boolean };
      };
      return {
        payloadKey,
        kind: "form",
        formKey: payloadKey,
        required: fieldDef.required !== false && fieldDef.validation?.required !== false,
      };
    }

    return { payloadKey, kind: "constant", value: rawValue };
  });
}

export function getCurrentStateFieldKeys(
  inputData: Record<string, unknown>,
  variableDefinitions: Record<string, VariableDefinitionLike> = {},
): { formFieldKeys: string[]; requiredFieldKeys: string[] } {
  const formEntries = normalizeInputDataEntries(inputData, variableDefinitions).filter(
    (entry): entry is Extract<NormalizedInputDataEntry, { kind: "form" }> => entry.kind === "form",
  );

  return {
    formFieldKeys: formEntries.map((entry) => entry.formKey),
    requiredFieldKeys: formEntries.filter((entry) => entry.required).map((entry) => entry.formKey),
  };
}

export function buildCurrentStateBlankValues(
  inputData: Record<string, unknown>,
  variableDefinitions: Record<string, VariableDefinitionLike> = {},
): Record<string, string> {
  return Object.fromEntries(
    normalizeInputDataEntries(inputData, variableDefinitions)
      .filter((entry): entry is Extract<NormalizedInputDataEntry, { kind: "form" }> => entry.kind === "form")
      .map((entry) => [entry.formKey, ""]),
  );
}

export function buildCurrentStatePayload(
  inputData: Record<string, unknown>,
  formValues: Record<string, unknown>,
  variableDefinitions: Record<string, VariableDefinitionLike> = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const entry of normalizeInputDataEntries(inputData, variableDefinitions)) {
    if (entry.kind === "constant") {
      payload[entry.payloadKey] = entry.value;
      continue;
    }

    const submittedValue = formValues[entry.formKey];
    if (isBlankFormValue(submittedValue)) {
      if (entry.required) {
        throw new Error(`Missing required input value: ${entry.formKey}`);
      }
      continue;
    }

    payload[entry.payloadKey] = submittedValue;
  }

  return payload;
}
