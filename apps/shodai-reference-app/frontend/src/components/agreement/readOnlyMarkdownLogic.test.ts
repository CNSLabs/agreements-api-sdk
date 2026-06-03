import assert from "node:assert/strict";
import test from "node:test";

import {
  getReadOnlyMarkdownPreviewText,
  isReadOnlyMarkdownVariable,
} from "./readOnlyMarkdownLogic.ts";

test("isReadOnlyMarkdownVariable only matches string markdown fields", () => {
  assert.equal(isReadOnlyMarkdownVariable({ type: "string", subType: "markdown" }), true);
  assert.equal(isReadOnlyMarkdownVariable({ type: "string", subType: "MARKDOWN" }), true);
  assert.equal(isReadOnlyMarkdownVariable({ type: "string", subType: "longText" }), false);
  assert.equal(isReadOnlyMarkdownVariable({ type: "address", subType: "markdown" }), false);
  assert.equal(isReadOnlyMarkdownVariable(null), false);
});

test("getReadOnlyMarkdownPreviewText preserves the user-visible text while stripping markdown syntax", () => {
  assert.equal(
    getReadOnlyMarkdownPreviewText("# Heading\n\nReview [the guide](https://example.com/docs) before `deploy`."),
    "Heading\n\nReview the guide before deploy.",
  );
});
