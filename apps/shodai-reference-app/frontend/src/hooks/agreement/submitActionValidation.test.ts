import test from "node:test";
import assert from "node:assert/strict";

import { getActionSubmitValidationTarget } from "./submitActionValidation.ts";

test("getActionSubmitValidationTarget validates every rendered action field", () => {
  assert.deepEqual(
    getActionSubmitValidationTarget([
      "approvalReason",
      "optionalFeedback",
      "invoiceLineItems",
    ]),
    [
      "approvalReason",
      "optionalFeedback",
      "invoiceLineItems",
    ],
  );
});

test("getActionSubmitValidationTarget skips validation when no action fields are rendered", () => {
  assert.equal(getActionSubmitValidationTarget([]), null);
});
