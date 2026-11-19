import test from "node:test";
import assert from "node:assert/strict";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

import { markdownSanitizeSchema } from "./markdownSanitize.ts";

// The pipeline documentExport.ts runs, and the plugins both on-screen renderers use.
async function render(markdown: string): Promise<string> {
  return String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeSanitize, markdownSanitizeSchema)
      .use(rehypeStringify)
      .process(markdown),
  );
}

test("raw HTML that can run script or load a document is removed", async () => {
  const html = await render(
    [
      'Party: <img src="x" onerror="alert(1)">',
      "<script>alert(2)</script>",
      '<iframe srcdoc="<script>alert(3)</script>"></iframe>',
      '<a href="javascript:alert(4)">terms</a>',
      '<form action="https://evil.example"><input name="token"></form>',
      '<p style="position:fixed;inset:0" onclick="alert(5)">cover</p>',
    ].join("\n\n"),
  );

  for (const fragment of ["onerror", "<script", "<iframe", "javascript:", "<form", "style=", "onclick"]) {
    assert.ok(!html.includes(fragment), `${fragment} survived in: ${html}`);
  }
});

test("the form-field marker and template formatting survive", async () => {
  const html = await render(
    'BETWEEN: <u>Acme</u><br>\n\n<div class="variable-input" data-name="partyAName"></div>\n\n| a | b |\n| - | - |\n| 1 | 2 |',
  );

  assert.ok(html.includes("<u>Acme</u>"), html);
  assert.ok(html.includes("<br>"), html);
  assert.ok(html.includes('<div class="variable-input" data-name="partyAName"></div>'), html);
  assert.ok(html.includes("<table>"), html);
});

test("the marker cannot carry anything but its class and name", async () => {
  const html = await render(
    '<div class="variable-input evil" data-name="x" data-other="y" onclick="alert(1)" style="color:red"></div>',
  );

  assert.equal(html, '<div class="variable-input" data-name="x"></div>');
});
