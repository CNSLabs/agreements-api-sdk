import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateInvoiceCsvTotal,
  getInvoiceCsvRowIssues,
  parseInvoiceCsvValue,
  serializeInvoiceCsvValue,
  validateInvoiceCsvValue,
} from "./invoiceCsvLogic.ts";

test("parseInvoiceCsvValue accepts a four-column header and keeps the date column", () => {
  assert.deepEqual(
    parseInvoiceCsvValue("date,description,quantity,rate\n2026-03-29,Design review,2,150"),
    [
      {
        date: "2026-03-29",
        description: "Design review",
        quantity: "2",
        rate: "150",
      },
    ],
  );
});

test("parseInvoiceCsvValue accepts a three-column header and backfills blank dates", () => {
  assert.deepEqual(
    parseInvoiceCsvValue("description,quantity,rate\nDesign review,2,150"),
    [
      {
        date: "",
        description: "Design review",
        quantity: "2",
        rate: "150",
      },
    ],
  );
});

test("serializeInvoiceCsvValue writes the shared four-column header and escapes quoted values", () => {
  assert.equal(
    serializeInvoiceCsvValue([
      {
        date: "2026-03-29",
        description: 'Design review, "phase 1"',
        quantity: "2",
        rate: "150",
      },
      {
        date: "",
        description: "",
        quantity: "",
        rate: "",
      },
    ]),
    'date,description,quantity,rate\n2026-03-29,"Design review, ""phase 1""",2,150',
  );
});

test("calculateInvoiceCsvTotal sums numeric line amounts and ignores incomplete rows", () => {
  assert.equal(
    calculateInvoiceCsvTotal([
      {
        date: "2026-03-29",
        description: "Design review",
        quantity: "2",
        rate: "150",
      },
      {
        date: "2026-03-30",
        description: "Follow-up",
        quantity: "",
        rate: "80",
      },
    ]),
    300,
  );
});

test("getInvoiceCsvRowIssues requires description plus numeric quantity and rate for meaningful rows", () => {
  assert.deepEqual(
    getInvoiceCsvRowIssues({
      date: "",
      description: "",
      quantity: "2",
      rate: "nope",
    }),
    {
      description: "Required",
      rate: "Enter a numeric rate",
    },
  );
});

test("validateInvoiceCsvValue rejects malformed invoice rows", () => {
  assert.equal(
    validateInvoiceCsvValue("date,description,quantity,rate\n2026-03-29,Design review,2", "Invoice line items"),
    "Expense line 1 must contain date, description, quantity, and rate",
  );
});
