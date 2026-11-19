import { defaultSchema } from "rehype-sanitize";
import type { Options as SanitizeSchema } from "rehype-sanitize";

/**
 * What raw HTML may survive in rendered agreement markdown.
 *
 * Agreement content and variable values come from other parties, and the
 * renderers allow raw HTML so that templates can use it for layout. This is
 * the default rehype-sanitize schema (the GitHub rules: no script, style,
 * iframe, form or event-handler attributes, and only safe URL schemes) plus
 * the underline tag the shipped templates use and the one marker the document
 * view writes itself, which it turns into a form field:
 * `<div class="variable-input" data-name="...">`.
 */
export const markdownSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  // The MOU template underlines the fields a party fills in.
  tagNames: [...(defaultSchema.tagNames ?? []), "u"],
  attributes: {
    ...defaultSchema.attributes,
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ["className", "variable-input"],
      "dataName",
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ["className", "variable-input"],
      "dataName",
    ],
  },
};
