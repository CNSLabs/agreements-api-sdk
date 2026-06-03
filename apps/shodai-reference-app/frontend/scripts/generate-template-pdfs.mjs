import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";

function slug(templateId) {
  return String(templateId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function replaceVariableTokens(md) {
  return String(md || "").replace(/\$\{variables\.([^}]+)\}/g, (_match, variablePath) => {
    const variableName = String(variablePath).split(".")[0];
    return `<span class="var-token">${variableName}</span>`;
  });
}

async function markdownToHtml(md) {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify)
    .process(md);
  return String(file);
}

function wrapHtml({ title, bodyHtml }) {
  // Keep this CSS self-contained so PDFs are consistent across environments.
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title || "Template"}</title>
    <style>
      /* Print/PDF page setup: margins must be configured at the print layer (not markdown). */
      @page { size: Letter; margin: 0.75in; }
      html, body { height: 100%; margin: 0; padding: 0; }
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        color: #111827;
        font-size: 12pt;
        line-height: 1.45;
        background: #f3f4f6;
      }
      .canvas {
        padding: 32px;
      }
      .page {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        box-shadow: 0 12px 30px rgba(17, 24, 39, 0.10);
        padding: 0.75in;
        /* Constrain to letter-ish width for consistent thumbnails */
        max-width: 8.5in;
        margin: 0 auto;
      }
      h1 { font-size: 20pt; margin: 0 0 14px; }
      h2 { font-size: 15pt; margin: 18px 0 10px; }
      h3 { font-size: 13pt; margin: 14px 0 8px; }
      p { margin: 0 0 10px; }
      ul, ol { margin: 0 0 10px 20px; padding: 0; }
      li { margin: 4px 0; }
      blockquote { border-left: 3px solid #e5e7eb; padding-left: 12px; margin: 10px 0; color: #374151; }
      a { color: #2563eb; text-decoration: none; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; background: #f3f4f6; padding: 1px 6px; border-radius: 6px; font-size: 10.5pt; }
      pre { background: #f3f4f6; padding: 12px; border-radius: 10px; overflow: hidden; }
      .var-token {
        display: inline-block;
        padding: 2px 7px;
        border-radius: 6px;
        border: 1px solid #e5e7eb;
        background: #f3f4f6;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 10.5pt;
      }
      /* Keep images from blowing out the page */
      img { max-width: 100%; height: auto; }

      /* Print/PDF: remove outer framing and rely on @page margins for every page. */
      @media print {
        body { background: #ffffff; }
        .canvas { padding: 0; }
        .page {
          border: none;
          border-radius: 0;
          box-shadow: none;
          margin: 0;
          max-width: none;
          /* Do NOT use padding for print; let @page margin handle per-page margins. */
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <div class="canvas">
      <div class="page">
        ${bodyHtml}
      </div>
    </div>
  </body>
</html>`;
}

async function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const templatesDir = process.env.AGREEMENT_TEMPLATES_DIR || path.resolve(repoRoot, "..", "data", "agreement-templates");
  const outDir = path.join(repoRoot, "public", "template-assets");

  await fs.mkdir(outDir, { recursive: true });

  // Get template filter from command line args (optional)
  const templateFilter = process.argv[2];

  let files = (await fs.readdir(templatesDir)).filter((f) => f.endsWith(".json"));
  
  // If a template filter is provided, only process matching files
  if (templateFilter) {
    const filterLower = templateFilter.toLowerCase();
    
    // First, try to match by filename
    let matchingFiles = files.filter((f) => {
      const nameLower = f.toLowerCase();
      // Match by filename (with or without .json extension)
      return nameLower.includes(filterLower) || nameLower === filterLower + ".json";
    });
    
    // If no filename match, try matching by templateId inside the JSON
    if (matchingFiles.length === 0) {
      for (const f of files) {
        try {
          const full = path.join(templatesDir, f);
          const raw = await fs.readFile(full, "utf8");
          const template = JSON.parse(raw);
          const templateId = (template?.metadata?.templateId || template?.metadata?.id || "").toLowerCase();
          if (templateId.includes(filterLower)) {
            matchingFiles.push(f);
          }
        } catch {
          // Skip files that can't be parsed
        }
      }
    }
    
    files = matchingFiles;
    
    if (files.length === 0) {
      console.log(`No template files found matching "${templateFilter}".`);
      return;
    }
  }

  if (files.length === 0) {
    console.log("No agreement template JSON files found.");
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Viewport sized to roughly a letter page at a readable preview scale.
  await page.setViewportSize({ width: 1200, height: 1550 });

  for (const f of files) {
    const full = path.join(templatesDir, f);
    const raw = await fs.readFile(full, "utf8");
    const template = JSON.parse(raw);
    const templateId = template?.metadata?.templateId || template?.metadata?.id;
    const md = template?.content?.data;

    if (!templateId || typeof md !== "string" || !md.trim()) {
      console.log(`Skipping ${f} (no metadata.templateId or no markdown content).`);
      continue;
    }

    const s = slug(templateId);
    const pdfPath = path.join(outDir, `${s}.pdf`);
    const pngPath = path.join(outDir, `${s}.png`);

    const replaced = replaceVariableTokens(md);
    const htmlBody = await markdownToHtml(replaced);
    const html = wrapHtml({ title: template?.metadata?.name || templateId, bodyHtml: htmlBody });

    await page.setContent(html, { waitUntil: "load" });

    // PDF
    await page.pdf({
      path: pdfPath,
      format: "Letter",
      printBackground: true,
      // Use CSS @page margins instead (more reliable / avoids double-margins).
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    // Thumbnail (first "page" viewport screenshot)
    await page.screenshot({ path: pngPath, fullPage: false });

    console.log(`✅ ${templateId} -> ${path.relative(repoRoot, pdfPath)} + ${path.relative(repoRoot, pngPath)}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

