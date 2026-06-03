import test from "node:test";
import assert from "node:assert/strict";

import { resolveSummaryVariableDefinition } from "./summaryVariableDefinition.ts";

test("resolveSummaryVariableDefinition falls back to input-local field definitions when no top-level variable exists", () => {
  const result = resolveSummaryVariableDefinition({
    key: "invoiceLineItems",
    topLevelVariables: {
      submitInvoiceComment: {
        type: "string",
        subType: "longText",
        name: "Additional Comments",
      },
    },
    inputDataDefinitions: {
      invoiceLineItems: {
        type: "string",
        subType: "invoice-csv",
        name: "Invoice Line Items",
      },
      submitInvoiceComment: "${variables.submitInvoiceComment}",
    },
  });

  assert.deepEqual(result, {
    type: "string",
    subType: "invoice-csv",
    name: "Invoice Line Items",
  });
});

test("resolveSummaryVariableDefinition prefers the top-level variable when both sources exist", () => {
  const result = resolveSummaryVariableDefinition({
    key: "submitInvoiceComment",
    topLevelVariables: {
      submitInvoiceComment: {
        type: "string",
        subType: "longText",
        name: "Additional Comments",
      },
    },
    inputDataDefinitions: {
      submitInvoiceComment: {
        type: "string",
        subType: "invoice-csv",
        name: "Wrong source",
      },
    },
  });

  assert.deepEqual(result, {
    type: "string",
    subType: "longText",
    name: "Additional Comments",
  });
});
