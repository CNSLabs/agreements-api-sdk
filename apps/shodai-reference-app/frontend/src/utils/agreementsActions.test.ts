import test from "node:test";
import assert from "node:assert/strict";

import { computeAvailableActions } from "./agreementsActions.ts";

const ACTIVE = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const LINKED = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const STRANGER = "0xcccccccccccccccccccccccccccccccccccccccc";

function agreement(overrides: Record<string, unknown> = {}) {
  return {
    id: "agreement-1",
    address: "0x1111111111111111111111111111111111111111",
    chainId: 59141,
    state: "PENDING",
    displayName: "Test Agreement",
    variables: {
      activeWallet: ACTIVE,
      linkedWallet: LINKED,
      strangerWallet: STRANGER,
    },
    updatedAt: "2026-08-18T00:00:00.000Z",
    json: {
      execution: {
        transitions: [
          { from: "PENDING", conditions: [{ input: "activeAction" }] },
          { from: "PENDING", conditions: [{ input: "linkedAction" }] },
          { from: "PENDING", conditions: [{ input: "strangerAction" }] },
          { from: "PENDING", conditions: [{ input: "unresolvableAction" }] },
        ],
        inputs: {
          activeAction: { issuer: "${variables.activeWallet}" },
          linkedAction: { issuer: "${variables.linkedWallet}" },
          strangerAction: { issuer: "${variables.strangerWallet}" },
          unresolvableAction: { issuer: "${variables.missingWallet}" },
        },
      },
    },
    ...overrides,
  };
}

test("wallet mismatch classifies actions instead of filtering them out", () => {
  const items = computeAvailableActions({
    agreements: [agreement()] as never[],
    userAddress: ACTIVE,
    userWallets: [ACTIVE, LINKED],
  });

  const byInput = new Map(items.map((item) => [item.inputId, item]));
  assert.equal(byInput.get("activeAction")?.availability, "ready");
  assert.equal(byInput.get("linkedAction")?.availability, "switch-wallet");
  assert.equal(byInput.get("strangerAction")?.availability, "other-wallet");
  // An issuer that resolves to no address stays out: there is nothing to name.
  assert.equal(byInput.has("unresolvableAction"), false);
});

test("non-ready actions name the wallet that can sign them", () => {
  const items = computeAvailableActions({
    agreements: [agreement()] as never[],
    userAddress: ACTIVE,
    userWallets: [ACTIVE],
  });

  const stranger = items.find((item) => item.inputId === "strangerAction");
  assert.deepEqual(stranger?.requiredWallets, [STRANGER]);
  assert.equal(stranger?.ctaLabel, "View");
  const ready = items.find((item) => item.inputId === "activeAction");
  assert.equal(ready?.ctaLabel, "Review now");
});

test("an empty wallet roster degrades linked wallets to other-wallet, never hides them", () => {
  const items = computeAvailableActions({
    agreements: [agreement()] as never[],
    userAddress: ACTIVE,
  });

  const linked = items.find((item) => item.inputId === "linkedAction");
  assert.equal(linked?.availability, "other-wallet");
});
