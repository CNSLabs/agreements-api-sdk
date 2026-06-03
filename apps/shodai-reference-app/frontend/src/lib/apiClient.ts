import axios, { AxiosHeaders, type AxiosInstance } from "axios";
import { createBrowserTelemetryHeaders } from "@/lib/telemetry";

/**
 * Creates an axios instance pre-configured with a Bearer auth token.
 * The token is fetched once at call time via the provided `getAuthToken` function.
 */
export async function createAuthenticatedAxiosInstance(
  getAuthToken: () => Promise<string | undefined>,
  baseURL: string
): Promise<AxiosInstance> {
  const authToken = await getAuthToken();
  const instance = axios.create({
    baseURL,
    headers: { "Content-Type": "application/json" },
  });

  instance.interceptors.request.use((config) => {
    const telemetryHeaders = createBrowserTelemetryHeaders();
    const authHeader = `Bearer ${authToken}`;
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
