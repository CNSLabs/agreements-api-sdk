import test from "node:test";
import assert from "node:assert/strict";

import { getAgreementVariableRowPresentation } from "./agreementVariableRowPresentation.ts";

test("raw http strings stay eligible for the compact url row even without url subtype", () => {
  const result = getAgreementVariableRowPresentation({
    rawValue: "https://example.com/really/long/link",
    hasOnchainDetails: false,
    variable: { type: "string" },
  });

  assert.deepEqual(result, {
    branch: "url",
    href: "https://example.com/really/long/link",
    truncate: true,
    preserveWhitespace: false,
    useMaxWidthTextBlock: false,
  });
});

test("non-http values do not take the url branch", () => {
  const result = getAgreementVariableRowPresentation({
    rawValue: "ftp://example.com/really/long/link",
    hasOnchainDetails: false,
    variable: { type: "string", subType: "url" },
  });

  assert.equal(result.branch, "plainText");
  assert.equal(result.href, null);
});

test("onchain branch wins before raw http url and markdown branches", () => {
  const result = getAgreementVariableRowPresentation({
    rawValue: "https://example.com/really/long/link",
    hasOnchainDetails: true,
    variable: { type: "string", subType: "markdown" },
  });

  assert.equal(result.branch, "onchain");
  assert.deepEqual(result, {
    branch: "onchain",
    href: null,
    truncate: false,
    preserveWhitespace: false,
    useMaxWidthTextBlock: false,
  });
});

test("raw http url wins over markdown when both could match", () => {
  const result = getAgreementVariableRowPresentation({
    rawValue: "https://example.com/really/long/link",
    hasOnchainDetails: false,
    variable: { type: "string", subType: "markdown" },
  });

  assert.equal(result.branch, "url");
});

test("longtext stays exempt from the shared max-width plain-text mechanic", () => {
  const result = getAgreementVariableRowPresentation({
    rawValue: "line 1\nline 2",
    hasOnchainDetails: false,
    variable: { type: "string", subType: "longText" },
  });

  assert.deepEqual(result, {
    branch: "plainText",
    href: null,
    truncate: false,
    preserveWhitespace: true,
    useMaxWidthTextBlock: false,
  });
});

test("invoice-csv preserves whitespace without taking the full-width longtext layout", () => {
  const result = getAgreementVariableRowPresentation({
    rawValue: "date,description\n2026-03-29,Work",
    hasOnchainDetails: false,
    variable: { type: "string", subType: "invoice-csv" },
  });

  assert.deepEqual(result, {
    branch: "plainText",
    href: null,
    truncate: false,
    preserveWhitespace: true,
    useMaxWidthTextBlock: true,
  });
});

test("default plain text uses the shared max-width mechanic when no earlier branch matches", () => {
  const result = getAgreementVariableRowPresentation({
    rawValue: "plain text value",
    hasOnchainDetails: false,
    variable: { type: "string" },
  });

  assert.deepEqual(result, {
    branch: "plainText",
    href: null,
    truncate: false,
    preserveWhitespace: false,
    useMaxWidthTextBlock: true,
  });
});

test("markdown wins over plain text when no earlier branch matches", () => {
  const result = getAgreementVariableRowPresentation({
    rawValue: "## heading",
    hasOnchainDetails: false,
    variable: { type: "string", subType: "markdown" },
  });

  assert.deepEqual(result, {
    branch: "markdown",
    href: null,
    truncate: false,
    preserveWhitespace: false,
    useMaxWidthTextBlock: false,
  });
});
