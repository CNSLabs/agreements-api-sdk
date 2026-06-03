import {
  getAgreementVariableRowPresentation,
  type AgreementVariableRowVariable,
} from "./agreementVariableRowPresentation.ts";
import { isReadOnlyLongTextVariable } from "./readOnlyLongTextLogic.ts";

export type AgreementValueContentBranch =
  | "onchain"
  | "url"
  | "markdown"
  | "readOnlyLongText"
  | "plainText";

export type AgreementValueContentShellVariant = "summary" | "activity";

export interface AgreementValueTextLinkPart {
  url: string;
  text: string;
}

export type AgreementValueTextPart = string | AgreementValueTextLinkPart;

export interface AgreementValueContentDecision {
  branch: AgreementValueContentBranch;
  href: string | null;
  linkifyText: boolean;
  onchainMode: "inline" | "compact" | null;
  preserveWhitespace: boolean;
  useMaxWidthTextBlock: boolean;
}

interface GetAgreementValueContentDecisionParams {
  rawValue: unknown;
  displayValue: string;
  variable?: AgreementVariableRowVariable | null;
  shellVariant?: AgreementValueContentShellVariant;
  hasOnchainDetails: boolean;
}

function hasHttpUrl(text: string): boolean {
  return /(https?:\/\/[^\s]+)/i.test(text);
}

export function splitAgreementValueTextWithLinks(text: string): AgreementValueTextPart[] {
  if (!text) return [text];

  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const parts: AgreementValueTextPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    parts.push({ url: match[0], text: match[0] });
    lastIndex = urlRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

export function getAgreementValueContentDecision(
  params: GetAgreementValueContentDecisionParams,
): AgreementValueContentDecision {
  const {
    rawValue,
    displayValue,
    variable = null,
    shellVariant = "summary",
    hasOnchainDetails,
  } = params;
  const presentation = getAgreementVariableRowPresentation({
    rawValue,
    hasOnchainDetails,
    variable,
  });

  if (presentation.branch === "onchain") {
    return {
      branch: "onchain",
      href: null,
      linkifyText: false,
      onchainMode: shellVariant === "activity" ? "inline" : "compact",
      preserveWhitespace: false,
      useMaxWidthTextBlock: false,
    };
  }

  if (presentation.branch === "url") {
    return {
      branch: "url",
      href: presentation.href,
      linkifyText: shellVariant === "activity",
      onchainMode: null,
      preserveWhitespace: false,
      useMaxWidthTextBlock: false,
    };
  }

  if (presentation.branch === "markdown") {
    return {
      branch: "markdown",
      href: null,
      linkifyText: false,
      onchainMode: null,
      preserveWhitespace: false,
      useMaxWidthTextBlock: false,
    };
  }

  if (isReadOnlyLongTextVariable(variable)) {
    return {
      branch: "readOnlyLongText",
      href: null,
      linkifyText: shellVariant === "activity" && hasHttpUrl(displayValue),
      onchainMode: null,
      preserveWhitespace: true,
      useMaxWidthTextBlock: presentation.useMaxWidthTextBlock,
    };
  }

  return {
    branch: "plainText",
    href: null,
    linkifyText: shellVariant === "activity" && hasHttpUrl(displayValue),
    onchainMode: null,
    preserveWhitespace: presentation.preserveWhitespace,
    useMaxWidthTextBlock: presentation.useMaxWidthTextBlock,
  };
}
