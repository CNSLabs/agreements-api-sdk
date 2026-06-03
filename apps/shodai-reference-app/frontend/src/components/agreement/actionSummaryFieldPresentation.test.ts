import test from "node:test";
import assert from "node:assert/strict";

import { getActionSummaryFieldPresentation } from "./actionSummaryFieldPresentation.ts";

test("getActionSummaryFieldPresentation only links explicit url fields with http or https values", () => {
  assert.deepEqual(
    getActionSummaryFieldPresentation({
      rawValue: "https://sepolia.etherscan.io/tx/0xabc",
      displayValue: "https://sepolia.etherscan.io/tx/0xabc",
      variable: {
        type: "string",
        subType: "url",
      },
    }),
    {
      displayValue: "https://sepolia.etherscan.io/tx/0xabc",
      isTruncated: false,
      href: "https://sepolia.etherscan.io/tx/0xabc",
      preserveWhitespace: false,
    },
  );

  assert.deepEqual(
    getActionSummaryFieldPresentation({
      rawValue: "javascript:alert(1)",
      displayValue: "javascript:alert(1)",
      variable: {
        type: "string",
        subType: "url",
      },
    }),
    {
      displayValue: "javascript:alert(1)",
      isTruncated: false,
      href: null,
      preserveWhitespace: false,
    },
  );

  assert.deepEqual(
    getActionSummaryFieldPresentation({
      rawValue: "https://example.com/not-linked",
      displayValue: "https://example.com/not-linked",
      variable: {
        type: "string",
      },
    }),
    {
      displayValue: "https://example.com/not-linked",
      isTruncated: false,
      href: null,
      preserveWhitespace: false,
    },
  );
});

test("getActionSummaryFieldPresentation preserves whitespace for long text and invoice csv values", () => {
  assert.deepEqual(
    getActionSummaryFieldPresentation({
      rawValue: "line 1\nline 2",
      displayValue: "line 1\nline 2",
      variable: {
        type: "string",
        subType: "longText",
      },
    }),
    {
      displayValue: "line 1\nline 2",
      isTruncated: false,
      href: null,
      preserveWhitespace: true,
    },
  );

  assert.deepEqual(
    getActionSummaryFieldPresentation({
      rawValue: "date,description\n2026-03-29,Work",
      displayValue: "date,description\n2026-03-29,Work",
      variable: {
        type: "string",
        subType: "invoice-csv",
      },
    }),
    {
      displayValue: "date,description\n2026-03-29,Work",
      isTruncated: false,
      href: null,
      preserveWhitespace: true,
    },
  );
});

test("getActionSummaryFieldPresentation preserves the original href when compact url display is truncated", () => {
  assert.deepEqual(
    getActionSummaryFieldPresentation({
      rawValue: "https://sepolia.lineascan.build/tx/0x0ffc2c484ec8fed1125611fb61805d1e7c6a2a2ef693749cee59973807f0847d",
      displayValue: "https://sepolia.lineascan.build/tx/0x0ffc2c484ec8fed1125611fb61805d1e7c6a2a2ef693749cee59973807f0847d",
      truncateAt: 30,
      variable: {
        type: "string",
        subType: "url",
      },
    }),
    {
      displayValue: "https://sepolia.lineascan.buil…",
      isTruncated: true,
      href: "https://sepolia.lineascan.build/tx/0x0ffc2c484ec8fed1125611fb61805d1e7c6a2a2ef693749cee59973807f0847d",
      preserveWhitespace: false,
    },
  );
});
