/**
 * A value is set by whoever filled the field in, often another party to the
 * agreement, and the markdown it is spliced into is rendered with raw HTML
 * allowed. With "<" replaced by its entity a value can still carry markdown
 * formatting, but it cannot open an HTML tag.
 */
export function neutralizeMarkup(value: string): string {
  return value.replace(/</g, "&lt;");
}
