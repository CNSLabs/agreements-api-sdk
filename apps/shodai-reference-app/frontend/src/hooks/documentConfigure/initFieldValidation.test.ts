import test from "node:test";
import assert from "node:assert/strict";

import { getInitFieldErrors } from "./initFieldValidation.ts";

test("getInitFieldErrors treats initialize-data fields as required even when variable metadata marks them optional", () => {
  assert.deepEqual(
    getInitFieldErrors({
      fieldKeys: ["retainerTitle", "billingContact"],
      values: {
        retainerTitle: "",
        billingContact: "0x0000000000000000000000000000000000000000",
      },
      variables: {
        retainerTitle: {
          type: "string",
          name: "Retainer Title",
          validation: { required: false },
        },
        billingContact: {
          type: "address",
          name: "Billing Contact",
          validation: { required: false },
        },
      },
    }),
    {
      retainerTitle: "Required",
      billingContact: null,
    },
  );
});

test("getInitFieldErrors still validates optional-looking init fields when values are present", () => {
  assert.deepEqual(
    getInitFieldErrors({
      fieldKeys: ["billingContact", "effectiveAt"],
      values: {
        billingContact: "not-an-address",
        effectiveAt: "not-a-date",
      },
      variables: {
        billingContact: {
          type: "address",
          name: "Billing Contact",
          validation: { required: false },
        },
        effectiveAt: {
          type: "dateTime",
          name: "Effective At",
          validation: { required: false },
        },
      },
    }),
    {
      billingContact: "Invalid address",
      effectiveAt: "Invalid date",
    },
  );
});
