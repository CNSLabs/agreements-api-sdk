import assert from "node:assert/strict";
import test from "node:test";

import {
  findCollapsedReadOnlyLongText,
  isReadOnlyLongTextVariable,
} from "./readOnlyLongTextLogic.ts";

test("isReadOnlyLongTextVariable only matches string longText fields", () => {
  assert.equal(isReadOnlyLongTextVariable({ type: "string", subType: "longText" }), true);
  assert.equal(isReadOnlyLongTextVariable({ type: "string", subType: "LONGTEXT" }), true);
  assert.equal(isReadOnlyLongTextVariable({ type: "string", subType: "markdown" }), false);
  assert.equal(isReadOnlyLongTextVariable({ type: "address", subType: "longText" }), false);
  assert.equal(isReadOnlyLongTextVariable(null), false);
});

test("findCollapsedReadOnlyLongText leaves values alone when the full text fits", () => {
  const result = findCollapsedReadOnlyLongText({
    text: "Short value",
    fits: (candidate) => candidate === "Short value" || candidate === "Short value… show more",
  });

  assert.deepEqual(result, {
    collapsedText: "Short value",
    isCollapsed: false,
  });
});

test("findCollapsedReadOnlyLongText appends the inline suffix when the text needs collapsing", () => {
  const result = findCollapsedReadOnlyLongText({
    text: "Alpha beta gamma delta epsilon zeta eta theta",
    fits: (candidate) => candidate.length <= 30,
  });

  assert.equal(result.isCollapsed, true);
  assert.equal(result.collapsedText.endsWith("… show more"), true);
  assert.equal(result.collapsedText.includes("theta"), false);
});

test("findCollapsedReadOnlyLongText prefers the last whole-word break that still fits", () => {
  const result = findCollapsedReadOnlyLongText({
    text: "Alpha beta gamma delta",
    fits: (candidate) => candidate.length <= 21,
  });

  assert.deepEqual(result, {
    collapsedText: "Alpha beta… show more",
    isCollapsed: true,
  });
});

test("findCollapsedReadOnlyLongText falls back to character-level trimming when there is no word break", () => {
  const result = findCollapsedReadOnlyLongText({
    text: "Supercalifragilisticexpialidocious",
    fits: (candidate) => candidate.length <= 22,
  });

  assert.deepEqual(result, {
    collapsedText: "Supercalifr… show more",
    isCollapsed: true,
  });
});
