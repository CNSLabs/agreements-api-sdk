/**
 * Returns true if the string looks like a valid email address.
 * Used to validate participant and observer email fields.
 */
export function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
