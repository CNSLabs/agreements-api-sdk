import { FeatherExternalLink } from "@subframe/core";
import * as React from "react";

import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { OnchainReferenceDisplay } from "@/components/OnchainReferenceDisplay";
import { getOnchainReferenceDetails } from "@/utils/onchainReferences";
import { IconButton } from "@/subframe/components/IconButton";

import { ReadOnlyLongText, isReadOnlyLongTextVariable } from "./readOnlyLongText";
import { getReadOnlyMarkdownPreviewText } from "./readOnlyMarkdownLogic";
import {
  getAgreementValueContentDecision,
  splitAgreementValueTextWithLinks,
} from "./agreementValueContentLogic";
import type { AgreementVariableRowVariable } from "./agreementVariableRowPresentation";

export interface AgreementValueContentProps {
  rawValue: unknown;
  displayValue?: string;
  variable?: AgreementVariableRowVariable | null;
  shellVariant?: "summary" | "activity";
}

function stringifyValue(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

const TextWithLinks: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  if (!text || typeof text !== "string") return <span className={className}>{text}</span>;
  const parts = splitAgreementValueTextWithLinks(text);
  if (parts.length === 1 && typeof parts[0] === "string") return <span className={className}>{text}</span>;

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (typeof part === "string") {
          return <span key={index}>{part}</span>;
        }

        return (
          <a
            key={index}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-700 hover:underline break-all"
            onClick={(event) => event.stopPropagation()}
          >
            {part.text}
          </a>
        );
      })}
    </span>
  );
};

export function AgreementValueContent({
  rawValue,
  displayValue,
  variable = null,
  shellVariant = "summary",
}: AgreementValueContentProps) {
  const onchainDetails = getOnchainReferenceDetails(rawValue, variable);
  const resolvedDisplayValue = displayValue ?? stringifyValue(rawValue);
  const decision = getAgreementValueContentDecision({
    rawValue,
    displayValue: resolvedDisplayValue,
    variable,
    shellVariant,
    hasOnchainDetails: Boolean(onchainDetails),
  });
  const usesCompactPreservedWhitespace = decision.preserveWhitespace && !resolvedDisplayValue.includes("\n");
  const valueTextClass =
    shellVariant === "activity"
      ? "break-words text-caption font-caption text-subtext-color"
      : "break-words text-body font-body text-default-font";
  const longTextButtonClassName =
    shellVariant === "activity"
      ? "ml-1 inline p-0 text-caption font-caption text-brand-700 hover:underline"
      : "ml-1 inline p-0 text-body font-body text-brand-700 hover:underline";

  if (decision.branch === "onchain") {
    return decision.onchainMode === "inline" ? (
      <div className="flex items-center justify-end gap-2">
        <OnchainReferenceDisplay
          value={rawValue}
          variable={variable}
          mode="inline"
          textClassName={valueTextClass}
        />
      </div>
    ) : (
      <div className="ml-auto inline-flex max-w-full min-w-0 items-center justify-end gap-2 [&>*:not(:first-child)]:shrink-0">
        <OnchainReferenceDisplay
          value={rawValue}
          variable={variable}
          mode="compact"
          textClassName="min-w-0 shrink break-words text-right text-body font-body text-default-font"
        />
      </div>
    );
  }

  if (decision.branch === "url") {
    return decision.linkifyText ? (
      <TextWithLinks text={resolvedDisplayValue} className={valueTextClass} />
    ) : (
      <div className="flex min-w-0 grow shrink-0 basis-0 items-center justify-end gap-2">
        <a
          className="line-clamp-1 min-w-0 grow shrink-0 basis-0 break-all text-body font-body text-brand-700"
          href={decision.href || undefined}
          rel="noreferrer"
          target="_blank"
        >
          {resolvedDisplayValue}
        </a>
        <IconButton
          size="small"
          icon={<FeatherExternalLink />}
          onClick={() => {
            if (decision.href) {
              window.open(decision.href, "_blank");
            }
          }}
          title="Open in new tab"
        />
      </div>
    );
  }

  if (decision.branch === "markdown") {
    const markdownPreviewText = getReadOnlyMarkdownPreviewText(resolvedDisplayValue);

    return (
      <ReadOnlyLongText
        text={markdownPreviewText}
        expandedText={resolvedDisplayValue}
        containerClassName={shellVariant === "activity" ? "w-full text-left" : "max-w-[70%] text-left"}
        textClassName={valueTextClass}
        buttonClassName={longTextButtonClassName}
        renderExpandedText={(text) => (
          <MarkdownRenderer
            content={text}
            className="min-w-0 max-w-full [&_p]:my-0 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_pre]:my-1 [&_blockquote]:my-1"
          />
        )}
      />
    );
  }

  if (isReadOnlyLongTextVariable(variable)) {
    return (
      <ReadOnlyLongText
        text={resolvedDisplayValue}
        containerClassName={
          shellVariant === "activity"
            ? ""
            : decision.useMaxWidthTextBlock || usesCompactPreservedWhitespace
              ? "max-w-[70%] text-left"
              : "w-full text-left"
        }
        textClassName={`whitespace-pre-wrap ${valueTextClass}`}
        buttonClassName={longTextButtonClassName}
        renderText={decision.linkifyText ? (text) => <TextWithLinks text={text} /> : undefined}
      />
    );
  }

  if (shellVariant === "activity") {
    return (
      <TextWithLinks
        text={resolvedDisplayValue}
        className={`${valueTextClass} ${decision.preserveWhitespace ? "whitespace-pre-wrap" : ""}`.trim()}
      />
    );
  }

  return (
    <span
      className={`${valueTextClass} ${
        shellVariant === "activity"
          ? decision.preserveWhitespace
            ? "whitespace-pre-wrap"
            : ""
          : decision.preserveWhitespace
            ? decision.useMaxWidthTextBlock || usesCompactPreservedWhitespace
              ? "max-w-[70%] text-left whitespace-pre-wrap"
              : "w-full whitespace-pre-wrap"
            : decision.useMaxWidthTextBlock
              ? "max-w-[70%] text-left"
              : ""
      }`}
    >
      {resolvedDisplayValue}
    </span>
  );
}
