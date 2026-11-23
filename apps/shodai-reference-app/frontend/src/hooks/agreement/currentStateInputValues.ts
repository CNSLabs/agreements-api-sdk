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

type InputCheckLike = { field?: unknown; is?: unknown; to?: unknown; plus?: unknown; minus?: unknown };

function wholeNumber(value: unknown): bigint | null {
  if (typeof value === "bigint") return value >= 0n ? value : null;
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return BigInt(value.trim());
  return null;
}

const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * Values an input's checks leave no choice about, keyed like the form.
 *
 * A check `{ field, is: "equalTo", to, plus | minus }` accepts exactly one
 * number: the constant in `to`, or the stored variable it names, plus or minus
 * the amount. In a counted loop every step carries such a field (the round it
 * belongs to), and nobody should have to type it. A field whose value cannot be
 * worked out, or that two checks disagree on, is left for the user.
 */
export function buildCurrentStateDeterminedValues(
  inputDef: { data?: Record<string, unknown>; checks?: unknown } | null | undefined,
  storedValues: Record<string, unknown> = {},
  variableDefinitions: Record<string, VariableDefinitionLike> = {},
): Record<string, string> {
  if (!inputDef || !Array.isArray(inputDef.checks)) return {};
  const formKeyOf = new Map<string, string>();
  for (const entry of normalizeInputDataEntries(inputDef.data || {}, variableDefinitions)) {
    if (entry.kind === "form") formKeyOf.set(entry.payloadKey, entry.formKey);
  }

  const determined = new Map<string, string | null>();
  for (const check of inputDef.checks as InputCheckLike[]) {
    if (!check || typeof check !== "object" || check.is !== "equalTo" || typeof check.field !== "string") continue;
    const formKey = formKeyOf.get(check.field);
    if (!formKey) continue;

    const variable = typeof check.to === "string" ? parseVariableReference(check.to) : null;
    const base = variable ? wholeNumber(storedValues[variable]) : wholeNumber(check.to);
    const plus = check.plus === undefined ? 0n : wholeNumber(check.plus);
    const minus = check.minus === undefined ? 0n : wholeNumber(check.minus);
    // A check the SDK refuses to build is not worked out here either: 'plus'
    // with 'minus', or either of them on a constant.
    const unreadable =
      (check.plus !== undefined && check.minus !== undefined) ||
      (!variable && (check.plus !== undefined || check.minus !== undefined));
    const value = unreadable || base === null || plus === null || minus === null ? null : base + plus - minus;
    // Outside the range of a uint256 the contract refuses the step, so no value is offered.
    const text = value === null || value < 0n || value > MAX_UINT256 ? null : value.toString();

    const earlier = determined.get(formKey);
    determined.set(formKey, earlier !== undefined && earlier !== text ? null : text);
  }

  return Object.fromEntries(
    [...determined].filter((entry): entry is [string, string] => entry[1] !== null),
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
