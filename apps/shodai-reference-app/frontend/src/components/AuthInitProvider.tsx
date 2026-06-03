import * as React from "react";
import { useLogin } from "@/hooks/useLogin";
import { useApi } from "@/hooks/useApi";

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

type AuthInitContextValue = {
  status: "idle" | "loading" | "ready" | "error";
  user?: AuthUser;
  token?: string;
  error?: Error;
  retry: () => void;
};

const AuthInitContext = React.createContext<AuthInitContextValue | null>(null);
const AUTH_INIT_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, AUTH_INIT_TIMEOUT_MS);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export function useAuthInit() {
  const ctx = React.useContext(AuthInitContext);
  if (!ctx) throw new Error("useAuthInit must be used within AuthInitProvider");
  return ctx;
}

export const AuthInitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isConnected, address, getAuthToken } = useLogin();
  const { signUp, signIn } = useApi();

  // Attempt signup/signin once the wallet prerequisites are ready.
  const [status, setStatus] = React.useState<AuthInitContextValue["status"]>("idle");
  const [error, setError] = React.useState<Error | undefined>(undefined);
  const [user, setUser] = React.useState<AuthUser | undefined>(undefined);
  const [token, setToken] = React.useState<string | undefined>(undefined);
  const [retryNonce, setRetryNonce] = React.useState(0);

  React.useEffect(() => {
    const init = async () => {
      if (!isConnected || !address) {
        setStatus("idle");
        setError(undefined);
        setUser(undefined);
        setToken(undefined);
        return;
      }

      // Don't re-initialize if already loading or ready
      if (status === "ready" || status === "loading") {
        return;
      }

      try {
        setStatus("loading");
        setError(undefined);

        // Sign up first, then fall back to sign in if the user already exists.
        const freshAuth = sessionStorage.getItem("freshAuth") === "true";
        let u: AuthUser | null = null;
        const signUpRes = await withTimeout(signUp({ freshAuth }), "Auth signup");
        u = (signUpRes?.user as AuthUser) ?? null;
        if (!signUpRes?.success) {
          const signInRes = await withTimeout(signIn({ freshAuth }), "Auth signin");
          u = (signInRes?.user as AuthUser) ?? null;
        }
        if (!u) throw new Error("Failed to authenticate user");
        if (freshAuth) {
          sessionStorage.removeItem("freshAuth");
        }

        // Keep token available for callers that need it later
        const t = await getAuthToken();
        setUser(u);
        setToken(t);
        setStatus("ready");
      } catch (e: any) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus("error");
      }
    };
    void init();
  }, [isConnected, address, retryNonce, status, signUp, signIn, getAuthToken]);

  const retry = React.useCallback(() => {
    setStatus("idle");
    setError(undefined);
    setRetryNonce((x) => x + 1);
  }, []);

  const value: AuthInitContextValue = React.useMemo(() => {
    if (status === "ready") return { status: "ready", user, token, retry };
    if (status === "error") return { status: "error", error, retry };
    return { status, retry };
  }, [error, retry, status, token, user]);

  return <AuthInitContext.Provider value={value}>{children}</AuthInitContext.Provider>;
};
