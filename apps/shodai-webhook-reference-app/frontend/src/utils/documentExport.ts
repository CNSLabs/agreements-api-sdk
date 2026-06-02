import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";
import { markdownWithValues } from "./markdownWithValues";

/**
 * Builds markdown with variable values spliced into the prose.
 * Then converts to HTML for PDF/print.
 */
export async function markdownWithValuesToHtml(
  markdown: string,
  variableValues: Record<string, unknown>,
  options?: Parameters<typeof markdownWithValues>[2]
): Promise<string> {
  const filled = markdownWithValues(markdown, variableValues, options);
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(filled);
  return String(file);
}

const PRINT_STYLES = `
  @page { size: Letter; margin: 0.25in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 12pt; line-height: 1.5; color: #111827; }
  body { padding: 0.2in; }
  @media print {
    html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  h1 { font-size: 20pt; margin: 0 0 14px; }
  h2 { font-size: 15pt; margin: 18px 0 10px; }
  h3 { font-size: 13pt; margin: 14px 0 8px; }
  p { margin: 0 0 10px; }
  ul, ol { margin: 0 0 10px 20px; padding: 0; }
  li { margin: 4px 0; }
  blockquote { border-left: 3px solid #e5e7eb; padding-left: 12px; margin: 10px 0; color: #374151; }
  a { color: #2563eb; text-decoration: none; }
  code { font-family: ui-monospace, monospace; background: #f3f4f6; padding: 1px 6px; border-radius: 4px; font-size: 10.5pt; }
  pre { background: #f3f4f6; padding: 12px; border-radius: 8px; overflow-x: auto; }
  img { max-width: 100%; height: auto; }
`;

/**
 * Opens the document in a hidden iframe and triggers print.
 * Uses an iframe instead of a new window so the main page background/styling
 * is not affected when the print dialog opens.
 */
export function printDocument(htmlBody: string, title: string) {
  const doc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  ${htmlBody}
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    return;
  }

  iframeDoc.open();
  iframeDoc.write(doc);
  iframeDoc.close();

  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();

  // Remove iframe after print dialog closes (user may cancel or print)
  setTimeout(() => {
    if (iframe.parentNode) {
      document.body.removeChild(iframe);
    }
  }, 1000);
}


function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

