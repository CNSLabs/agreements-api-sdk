import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCurrentStateBlankValues,
  buildCurrentStateDeterminedValues,
  buildCurrentStatePayload,
  getCurrentStateFieldKeys,
  normalizeInputDataEntries,
} from "./currentStateInputValues.ts";

test("buildCurrentStateBlankValues returns blank prospective values for required form fields", () => {
  const persistedValues = {
    invoiceLineItems:
      "date,description,quantity,rate\n2026-03-27,Moving the lawn and ...,1,2000",
    additionalComments: "Previously submitted comment",
  };

  const blankValues = buildCurrentStateBlankValues({
    invoiceLineItems: {
      type: "string",
      subType: "invoice-csv",
      validation: { required: true },
    },
    additionalComments: {
      type: "string",
      validation: { required: true },
    },
    optionalFeedback: {
      type: "string",
      validation: { required: false },
    },
  });

  assert.deepEqual(blankValues, {
    invoiceLineItems: "",
    additionalComments: "",
    optionalFeedback: "",
  });
  assert.notEqual(blankValues.invoiceLineItems, persistedValues.invoiceLineItems);
  assert.notEqual(blankValues.additionalComments, persistedValues.additionalComments);
});

test("buildCurrentStatePayload uses prospective values and rejects blank required fields", () => {
  const inputData = {
    invoiceLineItems: {
      type: "string",
      subType: "invoice-csv",
      validation: { required: true },
    },
    approveWithoutPayment: true,
    additionalComments: {
      type: "string",
      validation: { required: false },
    },
  };

  assert.throws(
    () =>
      buildCurrentStatePayload(inputData, {
        invoiceLineItems: "",
        additionalComments: "ready",
      }),
    /Missing required input value: invoiceLineItems/,
  );

  assert.deepEqual(
    buildCurrentStatePayload(inputData, {
      invoiceLineItems: "date,description,quantity,rate\n2026-03-29,Work,1,2500",
      additionalComments: "",
    }),
    {
      invoiceLineItems: "date,description,quantity,rate\n2026-03-29,Work,1,2500",
      approveWithoutPayment: true,
    },
  );
});

test("normalizeInputDataEntries honors optional variable references from top-level variable definitions", () => {
  assert.deepEqual(
    normalizeInputDataEntries(
      {
        approvalReason: "${variables.approvalReason}",
        optionalFeedback: "${variables.optionalFeedback}",
      },
      {
        approvalReason: {
          type: "string",
          validation: { required: true },
        },
        optionalFeedback: {
          type: "string",
          validation: { required: false },
        },
      },
    ),
    [
      {
        payloadKey: "approvalReason",
        kind: "form",
        formKey: "approvalReason",
        required: true,
      },
      {
        payloadKey: "optionalFeedback",
        kind: "form",
        formKey: "optionalFeedback",
        required: false,
      },
    ],
  );
});

test("getCurrentStateFieldKeys returns all form-backed fields and only the required subset", () => {
  assert.deepEqual(
    getCurrentStateFieldKeys(
      {
        approvalReason: "${variables.approvalReason}",
        optionalFeedback: "${variables.optionalFeedback}",
        invoiceLineItems: {
          type: "string",
          subType: "invoice-csv",
          validation: { required: true },
        },
        additionalComments: {
          type: "string",
          validation: { required: false },
        },
        approveWithoutPayment: true,
      },
      {
        approvalReason: {
          type: "string",
          validation: { required: true },
        },
        optionalFeedback: {
          type: "string",
          validation: { required: false },
        },
      },
    ),
    {
      formFieldKeys: [
        "approvalReason",
        "optionalFeedback",
        "invoiceLineItems",
        "additionalComments",
      ],
      requiredFieldKeys: ["approvalReason", "invoiceLineItems"],
    },
  );
});

test("buildCurrentStatePayload omits blank optional variable references but still rejects blank required ones", () => {
  const inputData = {
    approvalReason: "${variables.approvalReason}",
    optionalFeedback: "${variables.optionalFeedback}",
    approveWithoutPayment: true,
  };
  const variableDefinitions = {
    approvalReason: {
      type: "string",
      validation: { required: true },
    },
    optionalFeedback: {
      type: "string",
      validation: { required: false },
    },
  };

  assert.throws(
    () =>
      buildCurrentStatePayload(inputData, { approvalReason: "", optionalFeedback: "" }, variableDefinitions),
    /Missing required input value: approvalReason/,
  );

  assert.deepEqual(
    buildCurrentStatePayload(
      inputData,
      {
        approvalReason: "Approved",
        optionalFeedback: "",
      },
      variableDefinitions,
    ),
    {
      approvalReason: "Approved",
      approveWithoutPayment: true,
    },
  );
});


const loopStep = {
  data: {
    reviewNote: "${variables.reviewNote}",
    milestone: "${variables.milestone}",
    currentMilestone: "${variables.currentMilestone}",
    quarter: { type: "uint256", validation: { required: true } },
  },
  checks: [
    { field: "milestone", is: "equalTo", to: "${variables.currentMilestone}" },
    { field: "milestone", is: "lessThan", to: "${variables.milestoneCount}" },
    { field: "currentMilestone", is: "equalTo", to: "${variables.currentMilestone}", plus: 1 },
    { field: "quarter", is: "equalTo", to: 4 },
  ],
};

test("buildCurrentStateDeterminedValues fills the fields an equalTo check fixes", () => {
  assert.deepEqual(buildCurrentStateDeterminedValues(loopStep, { currentMilestone: "2", milestoneCount: "5" }), {
    milestone: "2",
    currentMilestone: "3",
    quarter: "4",
  });
  // Stored numbers may arrive as numbers or bigints.
  assert.deepEqual(buildCurrentStateDeterminedValues(loopStep, { currentMilestone: 7n }).currentMilestone, "8");
  assert.deepEqual(
    buildCurrentStateDeterminedValues(
      { data: { left: { type: "uint256" } }, checks: [{ field: "left", is: "equalTo", to: "${variables.left}", minus: "1" }] },
      { left: 3 },
    ),
    { left: "2" },
  );
});

test("buildCurrentStateDeterminedValues leaves a field alone when its value cannot be worked out", () => {
  // Nothing stored yet, a stored value that is not a number, and a result below zero.
  assert.deepEqual(buildCurrentStateDeterminedValues(loopStep, {}), { quarter: "4" });
  assert.deepEqual(buildCurrentStateDeterminedValues(loopStep, { currentMilestone: "soon" }), { quarter: "4" });
  assert.deepEqual(
    buildCurrentStateDeterminedValues(
      { data: { left: { type: "uint256" } }, checks: [{ field: "left", is: "equalTo", to: "${variables.left}", minus: 1 }] },
      { left: "0" },
    ),
    {},
  );
  // Two checks that disagree, a check on a field the input does not have, and no checks at all.
  assert.deepEqual(
    buildCurrentStateDeterminedValues(
      { data: { n: { type: "uint256" } }, checks: [{ field: "n", is: "equalTo", to: 1 }, { field: "n", is: "equalTo", to: 2 }, { field: "other", is: "equalTo", to: 3 }] },
      {},
    ),
    {},
  );
  assert.deepEqual(buildCurrentStateDeterminedValues({ data: { n: { type: "uint256" } } }, {}), {});
  assert.deepEqual(buildCurrentStateDeterminedValues(null, {}), {});
});

test("buildCurrentStateDeterminedValues offers no value the contract or the SDK would refuse", () => {
  const max = 2n ** 256n - 1n;
  const step = (check: Record<string, unknown>) => ({ data: { n: { type: "uint256" } }, checks: [{ field: "n", is: "equalTo", ...check }] });
  // A sum past the largest uint256: the contract refuses the step, so the field is left blank.
  assert.deepEqual(buildCurrentStateDeterminedValues(step({ to: "${variables.n}", plus: 1 }), { n: max }), {});
  // The largest value itself is still offered.
  assert.deepEqual(buildCurrentStateDeterminedValues(step({ to: "${variables.n}", plus: 1 }), { n: max - 1n }), { n: max.toString() });
  // Forms the SDK refuses to build: 'plus' with 'minus', and either of them on a constant.
  assert.deepEqual(buildCurrentStateDeterminedValues(step({ to: "${variables.n}", plus: 2, minus: 1 }), { n: 5 }), {});
  assert.deepEqual(buildCurrentStateDeterminedValues(step({ to: 5, plus: 1 }), {}), {});
  assert.deepEqual(buildCurrentStateDeterminedValues(step({ to: 5, minus: 1 }), {}), {});
});
