import axios, { AxiosHeaders, type AxiosInstance } from "axios";
import { createBrowserTelemetryHeaders } from "@/lib/telemetry";

/**
 * Creates an axios instance that authenticates every request with a Bearer
 * token fetched at request time. The instance itself is long-lived (callers
 * memoize it for the session), so the token must not be captured at creation:
 * Dynamic reissues the JWT when the user's credentials change — most notably
 * when they link a wallet mid-session — and a request carrying the creation-time
 * token would present a wallet set that no longer exists.
 */
export async function createAuthenticatedAxiosInstance(
  getAuthToken: () => Promise<string | undefined>,
  baseURL: string
): Promise<AxiosInstance> {
  const instance = axios.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
  });

  instance.interceptors.request.use(async (config) => {
    const telemetryHeaders = createBrowserTelemetryHeaders();
    const authHeader = `Bearer ${await getAuthToken()}`;
    if (!config.headers) {
      config.headers = new AxiosHeaders({
        Authorization: authHeader,
        ...telemetryHeaders,
      });
      return config;
    }
    if (config.headers instanceof AxiosHeaders) {
      config.headers.set("Authorization", authHeader);
      for (const [key, value] of Object.entries(telemetryHeaders)) {
        config.headers.set(key, value);
      }
      return config;
    }
    config.headers = new AxiosHeaders({
      ...(config.headers as Record<string, string>),
      Authorization: authHeader,
      ...telemetryHeaders,
    });
    return config;
  });

  return instance;
}
