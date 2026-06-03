export interface LoginCodeContext {
  email: string;
  returnTo: string;
}

export const LOGIN_CODE_CONTEXT_STORAGE_KEY = "agreements.loginCodeContext";

/** Only allow local absolute paths (no open redirects). */
export function safeReturnTo(value: string | null): string {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

function isLoginCodeContext(value: unknown): value is LoginCodeContext {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<LoginCodeContext>;
  return typeof maybe.email === "string" && typeof maybe.returnTo === "string";
}

export function persistLoginCodeContext(context: LoginCodeContext): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      LOGIN_CODE_CONTEXT_STORAGE_KEY,
      JSON.stringify(context),
    );
  } catch {
    // Ignore storage errors (private browsing, disabled storage, etc.).
  }
}

export function readLoginCodeContext(): LoginCodeContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LOGIN_CODE_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isLoginCodeContext(parsed)) return null;
    return {
      email: parsed.email,
      returnTo: safeReturnTo(parsed.returnTo),
    };
  } catch {
    return null;
  }
}

export function clearLoginCodeContext(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(LOGIN_CODE_CONTEXT_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}
