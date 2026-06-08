import * as React from "react";

export type AuthUser = {
  id: string;
  email?: string;
  platformUserId?: string;
  wallets?: Array<{
    address?: string;
    chain?: string;
    wallet_name?: string;
    wallet_provider?: string;
  }>;
  [key: string]: unknown;
};

export type AuthInitContextValue = {
  status: "idle" | "loading" | "ready" | "error";
  user?: AuthUser;
  token?: string;
  error?: Error;
  retry: () => void;
};

export const AuthInitContext = React.createContext<AuthInitContextValue | null>(null);

export function useAuthInit() {
  const ctx = React.useContext(AuthInitContext);
  if (!ctx) throw new Error("useAuthInit must be used within AuthInitProvider");
  return ctx;
}
