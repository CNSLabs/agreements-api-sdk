import test from "node:test";
import assert from "node:assert/strict";

import {
  formatRetainerBalanceDisplay,
  getRetainerBalanceLookup,
  resolveRetainerBalanceRpcUrl,
} from "./retainerBalancePresentation.ts";

test("getRetainerBalanceLookup returns lookup details only for invoice-csv actions with canonical CAIP variables", () => {
  const lookup = getRetainerBalanceLookup({
    availableInputs: {
      submitInvoice: {
        data: {
          invoiceLineItems: { type: "string", subType: "invoice-csv" },
        },
      },
    },
    recordVariables: {
      retainerAddress: "eip155:1:0x1111111111111111111111111111111111111111",
      currencyAddress: "eip155:1/erc20:0x2222222222222222222222222222222222222222",
    },
  });

  assert.deepEqual(lookup, {
    retainerAddress: "0x1111111111111111111111111111111111111111",
    currencyAddress: "0x2222222222222222222222222222222222222222",
    chainId: 1,
  });
});

test("getRetainerBalanceLookup returns null when the selected action has no invoice-csv field", () => {
  const lookup = getRetainerBalanceLookup({
    availableInputs: {
      addComment: {
        data: {
          comment: { type: "string" },
        },
      },
    },
    recordVariables: {
      retainerAddress: "eip155:1:0x1111111111111111111111111111111111111111",
      currencyAddress: "eip155:1/erc20:0x2222222222222222222222222222222222222222",
    },
  });

  assert.equal(lookup, null);
});

test("getRetainerBalanceLookup returns null when canonical values are missing, invalid, or on different chains", () => {
  assert.equal(
    getRetainerBalanceLookup({
      availableInputs: {
        submitInvoice: {
          data: {
            invoiceLineItems: { type: "string", subType: "invoice-csv" },
          },
        },
      },
      recordVariables: {
        retainerAddress: "eip155:1:0x1111111111111111111111111111111111111111",
      },
    }),
    null,
  );

  assert.equal(
    getRetainerBalanceLookup({
      availableInputs: {
        submitInvoice: {
          data: {
            invoiceLineItems: { type: "string", subType: "invoice-csv" },
          },
        },
      },
      recordVariables: {
        retainerAddress: "not-a-caip-account",
        currencyAddress: "eip155:1/erc20:0x2222222222222222222222222222222222222222",
      },
    }),
    null,
  );

  assert.equal(
    getRetainerBalanceLookup({
      availableInputs: {
        submitInvoice: {
          data: {
            invoiceLineItems: { type: "string", subType: "invoice-csv" },
          },
        },
      },
      recordVariables: {
        retainerAddress: "eip155:1:0x1111111111111111111111111111111111111111",
        currencyAddress: "eip155:10/erc20:0x2222222222222222222222222222222222222222",
      },
    }),
    null,
  );
});

test("getRetainerBalanceLookup ignores non-canonical retainer and currency aliases", () => {
  assert.equal(
    getRetainerBalanceLookup({
      availableInputs: {
        submitInvoice: {
          data: {
            invoiceLineItems: { type: "string", subType: "invoice-csv" },
          },
        },
      },
      recordVariables: {
        retainerAccount: "eip155:1:0x1111111111111111111111111111111111111111",
        paymentAsset: "eip155:1/erc20:0x2222222222222222222222222222222222222222",
      },
    }),
    null,
  );

  assert.equal(
    getRetainerBalanceLookup({
      availableInputs: {
        submitInvoice: {
          data: {
            invoiceLineItems: { type: "string", subType: "invoice-csv" },
          },
        },
      },
      recordVariables: {
        retainerAddressValue: "eip155:1:0x1111111111111111111111111111111111111111",
        currencyAddressValue: "eip155:1/erc20:0x2222222222222222222222222222222222222222",
      },
    }),
    null,
  );
});

test("getRetainerBalanceLookup treats invoice-csv detection case-insensitively", () => {
  const lookup = getRetainerBalanceLookup({
    availableInputs: {
      submitInvoice: {
        data: {
          invoiceLineItems: { type: "string", subType: "Invoice-Csv" },
        },
      },
    },
    recordVariables: {
      retainerAddress: "eip155:1:0x1111111111111111111111111111111111111111",
      currencyAddress: "eip155:1/erc20:0x2222222222222222222222222222222222222222",
    },
  });

  assert.equal(lookup?.chainId, 1);
});

test("getRetainerBalanceLookup still renders when a different available action is selected", () => {
  const lookup = getRetainerBalanceLookup({
    availableInputs: {
      addComment: {
        data: {
          comment: { type: "string" },
        },
      },
      submitInvoice: {
        data: {
          invoiceLineItems: { type: "string", subType: "invoice-csv" },
        },
      },
    },
    recordVariables: {
      retainerAddress: "eip155:1:0x1111111111111111111111111111111111111111",
      currencyAddress: "eip155:1/erc20:0x2222222222222222222222222222222222222222",
    },
  });

  assert.equal(lookup?.currencyAddress, "0x2222222222222222222222222222222222222222");
});

test("formatRetainerBalanceDisplay uses token symbol when available", () => {
  assert.equal(
    formatRetainerBalanceDisplay({ formattedBalance: "1,234.56", tokenSymbol: "USDC" }),
    "1,234.56 USDC",
  );
});

test("formatRetainerBalanceDisplay omits blank token symbols", () => {
  assert.equal(
    formatRetainerBalanceDisplay({ formattedBalance: "1,234.56", tokenSymbol: "" }),
    "1,234.56",
  );
});

test("resolveRetainerBalanceRpcUrl prefers the configured app RPC for the app chain", () => {
  assert.equal(
    resolveRetainerBalanceRpcUrl({
      chainId: 59141,
      appChainId: 59141,
      appRpcUrl: "https://linea-sepolia.example",
      infuraProjectId: "",
    }),
    "https://linea-sepolia.example",
  );
});

test("resolveRetainerBalanceRpcUrl can resolve a different agreement chain without using the app chain", () => {
  const rpcUrl = resolveRetainerBalanceRpcUrl({
    chainId: 11155111,
    appChainId: 59141,
    appRpcUrl: "https://linea-sepolia.example",
    infuraProjectId: "test-infura-key",
  });

  assert.equal(
    rpcUrl,
    "https://sepolia.infura.io/v3/test-infura-key",
  );
});
