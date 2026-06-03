import test from "node:test";
import assert from "node:assert/strict";

import { createValidationRules } from "./variableValidation.ts";

test("createValidationRules allows blank optional values but rejects invalid optional addresses when present", () => {
  const rules = createValidationRules({
    type: "address",
    name: "Signer Address",
    validation: { required: false },
  });

  assert.equal(rules.validate(""), true);
  assert.equal(rules.validate("not-an-address"), "Invalid Ethereum address");
});

test("createValidationRules rejects invalid optional datetimes when present", () => {
  const rules = createValidationRules({
    type: "dateTime",
    name: "Effective At",
    validation: { required: false },
  });

  assert.equal(rules.validate("not-a-date"), "Invalid date");
});
