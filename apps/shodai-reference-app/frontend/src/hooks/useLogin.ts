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
  const { sdkHasLoaded, handleLogOut, primaryWallet } = useDynamicContext();
  const { error, isProcessing, signInWithSocialAccount } = useSocialAccounts();

  const isLoggedIn = useIsLoggedIn();
  const { connectWithEmail, verifyOneTimePassword } = useConnectWithOtp();
  const primaryWalletAddress = isEvmAddress(primaryWallet?.address)
    ? primaryWallet.address
    : undefined;
  const resolvedAddress = address || primaryWalletAddress;

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
      isConnected: Boolean(isLoggedIn && resolvedAddress),
      isConnecting: isProcessing || Boolean(isLoggedIn && !resolvedAddress),
      connectError: error,
      address: resolvedAddress,
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
      resolvedAddress,
      sdkHasLoaded,
      handleLogOut,
      connectWithEmail,
      connectWithGoogle,
      verifyOneTimePassword,
      getAuthTokenAsync,
    ]
  );
}

function isEvmAddress(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}
