export interface ActionSummaryFieldVariable {
  type?: string;
  subType?: string;
}

export interface ActionSummaryFieldPresentation {
  displayValue: string;
  isTruncated: boolean;
  href: string | null;
  preserveWhitespace: boolean;
}

interface GetActionSummaryFieldPresentationParams {
  rawValue: unknown;
  displayValue: string;
  truncateAt?: number;
  variable: ActionSummaryFieldVariable | null | undefined;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function getActionSummaryFieldPresentation(
  params: GetActionSummaryFieldPresentationParams,
): ActionSummaryFieldPresentation {
  const { rawValue, displayValue, truncateAt, variable } = params;
  const subType = String(variable?.subType || "").toLowerCase();
  const isStringField = variable?.type === "string";
  const isLongText = isStringField && subType === "longtext";
  const isInvoiceCsv = isStringField && subType === "invoice-csv";
  const isUrlField = isStringField && subType === "url";
  const href = isUrlField && typeof rawValue === "string" && isHttpUrl(rawValue) ? rawValue : null;
  const shouldTruncate =
    typeof truncateAt === "number" &&
    truncateAt > 0 &&
    !isLongText &&
    !isInvoiceCsv &&
    displayValue.length > truncateAt;

  return {
    displayValue: shouldTruncate ? `${displayValue.slice(0, truncateAt)}…` : displayValue,
    isTruncated: shouldTruncate,
    href,
    preserveWhitespace: isLongText || isInvoiceCsv,
  };
}
