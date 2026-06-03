import { useAccount } from "wagmi";
import { useCallback, useMemo } from "react";
import { getAuthToken, useConnectWithOtp, useSocialAccounts } from "@dynamic-labs/sdk-react-core";
import { useIsLoggedIn, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { ProviderEnum } from "@dynamic-labs/types";

type SocialAccountsReturn = ReturnType<typeof useSocialAccounts>;
type ConnectWithOtpReturn = ReturnType<typeof useConnectWithOtp>;

export type UseLoginReturn = {
  isConnected: boolean;
  isConnecting: boolean;
  connectError: SocialAccountsReturn["error"];
  address: `0x${string}` | undefined;
  connectWithGoogle: () => void;
  connectWithEmail: ConnectWithOtpReturn["connectWithEmail"];
  verifyOTP: ConnectWithOtpReturn["verifyOneTimePassword"];
  disconnect: () => Promise<void>;
  isSdkInitialized: boolean;
  getAuthToken: () => Promise<string | undefined>;
};

export function useLogin(): UseLoginReturn {
  const { address } = useAccount();
  const { sdkHasLoaded, handleLogOut } = useDynamicContext();
  const { error, isProcessing, signInWithSocialAccount } = useSocialAccounts();

  const isLoggedIn = useIsLoggedIn();
  const { connectWithEmail, verifyOneTimePassword } = useConnectWithOtp();

  const connectWithGoogle = useCallback(
    () => signInWithSocialAccount(ProviderEnum.Google),
    [signInWithSocialAccount]
  );

  // getAuthToken from the Dynamic SDK is synchronous; wrap it in a Promise
  // so callers (e.g. createAuthenticatedAxiosInstance) can treat it uniformly.
  const getAuthTokenAsync = useCallback(
    async () => getAuthToken(),
    []
  );

  return useMemo(
    () => ({
      isConnected: isLoggedIn,
      isConnecting: isProcessing,
      connectError: error,
      address,
      connectWithGoogle,
      connectWithEmail,
      verifyOTP: verifyOneTimePassword,
      disconnect: handleLogOut,
      isSdkInitialized: sdkHasLoaded,
      getAuthToken: getAuthTokenAsync,
    }),
    [
      error,
      isLoggedIn,
      isProcessing,
      address,
      sdkHasLoaded,
      handleLogOut,
      connectWithEmail,
      connectWithGoogle,
      verifyOneTimePassword,
      getAuthTokenAsync,
    ]
  );
}
