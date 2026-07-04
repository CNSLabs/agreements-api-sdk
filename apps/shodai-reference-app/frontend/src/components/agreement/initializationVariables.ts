interface DocumentVariable {
  type?: string;
  subType?: string;
  name?: string;
}

interface GetInitializationVariableEntriesParams {
  initializeData: Record<string, unknown> | null | undefined;
  recordVariables: Record<string, unknown> | null | undefined;
  variables: Record<string, DocumentVariable>;
}

type InitializationVariableEntry = [key: string, value: unknown, variable: DocumentVariable | null];

const VARIABLE_REFERENCE_REGEX = /^\$\{variables\.(\w+)(?:\.value)?\}$/;

export function getInitializationVariableEntries({
  initializeData,
  recordVariables,
  variables,
}: GetInitializationVariableEntriesParams): InitializationVariableEntry[] {
  return Object.entries(initializeData ?? {}).map(([key, rawValue]) => {
    if (typeof rawValue === "string") {
      const variableMatch = rawValue.match(VARIABLE_REFERENCE_REGEX);

      if (variableMatch) {
        const referencedKey = variableMatch[1];
        return [
          key,
          recordVariables?.[referencedKey] !== undefined ? recordVariables[referencedKey] : referencedKey,
          variables[key] ?? variables[referencedKey] ?? null,
        ];
      }
    }

    return [key, rawValue, variables[key] ?? null];
  });
}
