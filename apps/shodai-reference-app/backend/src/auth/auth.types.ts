export interface DynamicWallet {
  address: string;
  chain?: string;
  wallet_name?: string;
  wallet_provider?: string;
}

export interface DynamicUser {
  email?: string;
  userId: string;
  verifiedCredentials: unknown[];
  wallets: DynamicWallet[];
}

export interface AuthUserContext extends DynamicUser {
  id: string;
  platformUserId: string;
}
