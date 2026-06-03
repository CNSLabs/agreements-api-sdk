import axios from "axios";
import { useLogin } from "@/hooks/useLogin";
import { createBrowserTelemetryHeaders } from "@/lib/telemetry";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || "/auth-api";

export function useApi() {
  const { getAuthToken } = useLogin();

  type AuthOptions = {
    freshAuth?: boolean;
  };

  const signUp = async (options?: AuthOptions) => {
    const token = await getAuthToken();
    const res = await axios.post(`${AUTH_API_URL}/auth/signup`, {
      token,
      ...(options?.freshAuth ? { freshAuth: true } : {}), }, {
      headers: createBrowserTelemetryHeaders(),
    });
    return res.data;
  };

  const signIn = async (options?: AuthOptions) => {
    const token = await getAuthToken();
    const res = await axios.post(`${AUTH_API_URL}/auth/signin`, {
      token,
      ...(options?.freshAuth ? { freshAuth: true } : {}),
    }, {
      headers: createBrowserTelemetryHeaders(),
    });
    return res.data;
  };

  return { signUp, signIn };
}
