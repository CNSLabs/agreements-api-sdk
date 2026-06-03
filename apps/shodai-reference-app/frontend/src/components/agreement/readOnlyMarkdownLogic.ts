import { unified } from "unified";
import remarkParse from "remark-parse";

export interface ReadOnlyMarkdownVariable {
  type?: string;
  subType?: string;
}

interface MarkdownAstNode {
  type?: string;
  value?: string;
  alt?: string;
  children?: MarkdownAstNode[];
}

const DOUBLE_BREAK_TYPES = new Set(["paragraph", "heading", "blockquote", "code"]);
const SINGLE_BREAK_TYPES = new Set(["listItem"]);

export function isReadOnlyMarkdownVariable(variable: ReadOnlyMarkdownVariable | null | undefined): boolean {
  return variable?.type === "string" && String(variable?.subType || "").toLowerCase() === "markdown";
}

function collectMarkdownText(node: MarkdownAstNode | null | undefined, parts: string[]) {
  if (!node?.type) {
    return;
  }

  if (node.type === "text" || node.type === "inlineCode" || node.type === "code") {
    parts.push(node.value || "");
    if (node.type === "code") {
      parts.push("\n");
    }
    return;
  }

  if (node.type === "image") {
    parts.push(node.alt || "");
    return;
  }

  if (node.type === "break") {
    parts.push("\n");
    return;
  }

  for (const child of node.children || []) {
    collectMarkdownText(child, parts);
  }

  if (DOUBLE_BREAK_TYPES.has(node.type)) {
    parts.push("\n\n");
    return;
  }

  if (SINGLE_BREAK_TYPES.has(node.type)) {
    parts.push("\n");
  }
}

export function getReadOnlyMarkdownPreviewText(markdown: string): string {
  if (!markdown) {
    return markdown;
  }

  try {
    const tree = unified().use(remarkParse).parse(markdown) as MarkdownAstNode;
    const parts: string[] = [];

    collectMarkdownText(tree, parts);

    const previewText = parts
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return previewText || markdown.trim();
  } catch {
    return markdown;
  }
}
