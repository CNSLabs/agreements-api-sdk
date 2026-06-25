import test from "node:test";
import assert from "node:assert/strict";

import { getInitialShowDefaultTemplates } from "./createAgreementFilters.ts";

test("getInitialShowDefaultTemplates keeps default templates visible when the user has no additive whitelist", () => {
  assert.equal(
    getInitialShowDefaultTemplates({
      defaultTemplateIds: ["default-1"],
      whitelistedTemplateIds: [],
    }),
    true,
  );
});

test("getInitialShowDefaultTemplates keeps default templates visible when the user also has additive whitelist entries", () => {
  assert.equal(
    getInitialShowDefaultTemplates({
      defaultTemplateIds: ["default-1"],
      whitelistedTemplateIds: ["shared-1"],
    }),
    true,
  );
});
