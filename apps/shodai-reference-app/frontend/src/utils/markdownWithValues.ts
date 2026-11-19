import { formatOnchainReferenceValue, type OnchainReferenceVariable } from "./onchainReferences";
import { neutralizeMarkup } from "./neutralizeMarkup";

/**
 * Splices variable values into markdown prose.
 * Replaces ${variables.xxx} and ${variables.xxx.nested} with actual values.
 * Returns markdown string with values filled in (no HTML, no input placeholders).
 * Values cannot introduce HTML: see neutralizeMarkup.
 */
export function markdownWithValues(
  markdown: string,
  variableValues: Record<string, unknown>,
  options?: {
    formatPaymentAmount?: (key: string, value: unknown, templateId?: string) => unknown;
    templateId?: string;
    toDatetimeLocal?: (value: unknown) => string;
    variables?: Record<string, OnchainReferenceVariable>;
  }
): string {
  const values = variableValues ?? {};
  const formatPayment = options?.formatPaymentAmount;
  const templateId = options?.templateId;
  const toDatetime = options?.toDatetimeLocal;
  const variables = options?.variables ?? {};

  return String(markdown ?? "").replace(
    /\$\{variables\.([^}]+)\}/g,
    (_match, variablePath) => {
      try {
        const parts = String(variablePath).split(".");
        const variableName = parts[0];
        if (!variableName) return _match;

        let rawValue: unknown;
        if (parts.length === 1) {
          rawValue = values[variableName];
        } else {
          let nested: unknown = values[variableName];
          for (let i = 1; i < parts.length; i++) {
            if (nested == null) break;
            nested = (nested as Record<string, unknown>)[parts[i]];
          }
          rawValue = nested;
        }

        if (rawValue === undefined || rawValue === null) {
          return "";
        }

        // Apply formatting if provided
        let displayValue: unknown = rawValue;
        if (formatPayment && templateId) {
          displayValue = formatPayment(variableName, rawValue, templateId);
        }
        if (toDatetime) {
          const dt = toDatetime(displayValue);
          if (dt) displayValue = dt;
        }

        displayValue = formatOnchainReferenceValue(displayValue, variables[variableName], {
          mode: "document",
        });

        return neutralizeMarkup(String(displayValue));
      } catch {
        return _match;
      }
    }
  );
}
