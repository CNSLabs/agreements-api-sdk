export interface AgreementVariableRowVariable {
  type?: string;
  subType?: string;
}

export interface AgreementVariableRowPresentation {
  branch: "onchain" | "url" | "markdown" | "plainText";
  href: string | null;
  truncate: boolean;
  preserveWhitespace: boolean;
  useMaxWidthTextBlock: boolean;
}

interface GetAgreementVariableRowPresentationParams {
  rawValue: unknown;
  hasOnchainDetails: boolean;
  variable: AgreementVariableRowVariable | null | undefined;
}

export function getAgreementVariableRowPresentation(
  params: GetAgreementVariableRowPresentationParams,
): AgreementVariableRowPresentation {
  const { rawValue, hasOnchainDetails, variable } = params;
  const subType = String(variable?.subType || "").toLowerCase();
  const isStringField = variable?.type === "string";
  const isLongText = isStringField && subType === "longtext";
  const isInvoiceCsv = isStringField && subType === "invoice-csv";
  const isMarkdown = isStringField && subType === "markdown";
  const isRawHttpUrl = typeof rawValue === "string" && rawValue.startsWith("http");

  if (hasOnchainDetails) {
    return {
      branch: "onchain",
      href: null,
      truncate: false,
      preserveWhitespace: false,
      useMaxWidthTextBlock: false,
    };
  }

  if (isRawHttpUrl) {
    return {
      branch: "url",
      href: rawValue,
      truncate: true,
      preserveWhitespace: false,
      useMaxWidthTextBlock: false,
    };
  }

  if (isMarkdown) {
    return {
      branch: "markdown",
      href: null,
      truncate: false,
      preserveWhitespace: false,
      useMaxWidthTextBlock: false,
    };
  }

  return {
    branch: "plainText",
    href: null,
    truncate: false,
    preserveWhitespace: isLongText || isInvoiceCsv,
    useMaxWidthTextBlock: !isLongText,
  };
}
