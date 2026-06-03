import assert from "node:assert/strict";
import test from "node:test";

import {
  getAgreementValueContentDecision,
  splitAgreementValueTextWithLinks,
} from "./agreementValueContentLogic.ts";

test("splitAgreementValueTextWithLinks preserves surrounding text around embedded URLs", () => {
  assert.deepEqual(
    splitAgreementValueTextWithLinks("Review https://example.com/details for the full log"),
    [
      "Review ",
      { url: "https://example.com/details", text: "https://example.com/details" },
      " for the full log",
    ],
  );
});

test("getAgreementValueContentDecision keeps summary raw URLs in the explicit url branch", () => {
  assert.deepEqual(
    getAgreementValueContentDecision({
      rawValue: "https://example.com/really/long/link",
      displayValue: "https://example.com/really/long/link",
      variable: { type: "string" },
      shellVariant: "summary",
      hasOnchainDetails: false,
    }),
    {
      branch: "url",
      href: "https://example.com/really/long/link",
      linkifyText: false,
      onchainMode: null,
      preserveWhitespace: false,
      useMaxWidthTextBlock: false,
    },
  );
});

test("getAgreementValueContentDecision linkifies activity raw URLs without adding the summary-only affordance", () => {
  assert.deepEqual(
    getAgreementValueContentDecision({
      rawValue: "https://example.com/really/long/link",
      displayValue: "https://example.com/really/long/link",
      variable: { type: "string" },
      shellVariant: "activity",
      hasOnchainDetails: false,
    }),
    {
      branch: "url",
      href: "https://example.com/really/long/link",
      linkifyText: true,
      onchainMode: null,
      preserveWhitespace: false,
      useMaxWidthTextBlock: false,
    },
  );
});

test("getAgreementValueContentDecision keeps markdown on the markdown branch", () => {
  assert.deepEqual(
    getAgreementValueContentDecision({
      rawValue: "# Heading",
      displayValue: "# Heading",
      variable: { type: "string", subType: "markdown" },
      shellVariant: "summary",
      hasOnchainDetails: false,
    }),
    {
      branch: "markdown",
      href: null,
      linkifyText: false,
      onchainMode: null,
      preserveWhitespace: false,
      useMaxWidthTextBlock: false,
    },
  );
});

test("getAgreementValueContentDecision keeps onchain rendering on the dedicated branch with shell-specific mode", () => {
  assert.deepEqual(
    getAgreementValueContentDecision({
      rawValue: "eip155:11155111:0x0123456789abcdef0123456789abcdef01234567",
      displayValue: "0x0123…4567",
      variable: { type: "string", subType: "caip10Account" },
      shellVariant: "summary",
      hasOnchainDetails: true,
    }),
    {
      branch: "onchain",
      href: null,
      linkifyText: false,
      onchainMode: "compact",
      preserveWhitespace: false,
      useMaxWidthTextBlock: false,
    },
  );
});

test("getAgreementValueContentDecision keeps longtext on the shared read-only surface and linkifies embedded URLs in activity", () => {
  assert.deepEqual(
    getAgreementValueContentDecision({
      rawValue: "See https://example.com/retainer\nfor details.",
      displayValue: "See https://example.com/retainer\nfor details.",
      variable: { type: "string", subType: "longtext" },
      shellVariant: "activity",
      hasOnchainDetails: false,
    }),
    {
      branch: "readOnlyLongText",
      href: null,
      linkifyText: true,
      onchainMode: null,
      preserveWhitespace: true,
      useMaxWidthTextBlock: false,
    },
  );
});

test("getAgreementValueContentDecision keeps invoice csv on the plain-text branch while preserving whitespace and embedded links", () => {
  assert.deepEqual(
    getAgreementValueContentDecision({
      rawValue: "date,description\n2026-03-29,https://example.com/invoice",
      displayValue: "date,description\n2026-03-29,https://example.com/invoice",
      variable: { type: "string", subType: "invoice-csv" },
      shellVariant: "activity",
      hasOnchainDetails: false,
    }),
    {
      branch: "plainText",
      href: null,
      linkifyText: true,
      onchainMode: null,
      preserveWhitespace: true,
      useMaxWidthTextBlock: true,
    },
  );
});
