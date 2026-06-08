import test from "node:test";
import assert from "node:assert/strict";

import { getInitializationVariableEntries } from "./initializationVariables.ts";

test("getInitializationVariableEntries returns only initialization entries in initialize-data order", () => {
  const entries = getInitializationVariableEntries({
    initializeData: {
      retainerTitle: "${variables.retainerTitle}",
      clientName: "${variables.clientName}",
    },
    recordVariables: {
      clientName: "client bros",
      retainerTitle: "retainer verification",
      awaitingPaymentComment: "later-state value",
    },
    variables: {
      retainerTitle: { name: "Retainer Title", type: "string" },
      clientName: { name: "Client Name", type: "string" },
      awaitingPaymentComment: { name: "Awaiting Payment Comment", type: "string" },
    },
  });

  assert.deepEqual(
    entries.map(([key, value, variable]) => ({
      key,
      value,
      label: variable?.name ?? null,
    })),
    [
      { key: "retainerTitle", value: "retainer verification", label: "Retainer Title" },
      { key: "clientName", value: "client bros", label: "Client Name" },
    ],
  );
});

test("getInitializationVariableEntries preserves literal initialize values", () => {
  const entries = getInitializationVariableEntries({
    initializeData: {
      agreementType: "retainer",
    },
    recordVariables: {
      agreementType: "later-mutated-value",
    },
    variables: {},
  });

  assert.deepEqual(entries, [["agreementType", "retainer", null]]);
});

test("getInitializationVariableEntries returns entries that the Overview tab can destructure as tuples", () => {
  const entries = getInitializationVariableEntries({
    initializeData: {
      retainerTitle: "${variables.retainerTitle}",
    },
    recordVariables: {
      retainerTitle: "retainer verification",
    },
    variables: {
      retainerTitle: { name: "Retainer Title", type: "string" },
    },
  });

  const [[key, value, variable]] = entries;

  assert.equal(key, "retainerTitle");
  assert.equal(value, "retainer verification");
  assert.equal(variable?.name, "Retainer Title");
});
