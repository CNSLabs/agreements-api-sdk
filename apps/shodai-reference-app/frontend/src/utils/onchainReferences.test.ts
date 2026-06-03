import test from "node:test";
import assert from "node:assert/strict";

import { getSafeAppUrl } from "./onchainReferences.ts";

test("getSafeAppUrl builds the Safe home deeplink for the Sepolia Safe address", () => {
  assert.equal(
    getSafeAppUrl("eip155:11155111:0xdAe7B57af2BE10b5Eca3f2835A1AB15537d8e844"),
    "https://app.safe.global/home?safe=sep:0xdAe7B57af2BE10b5Eca3f2835A1AB15537d8e844",
  );
});
