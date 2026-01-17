/**
 * MetaKeep SDK type definitions for Solana
 */

declare global {
  interface Window {
    MetaKeep: typeof MetaKeep;
  }
}

/**
 * MetaKeep user configuration
 */
interface MetaKeepUser {
  email?: string;
  phone?: string;
}

/**
 * MetaKeep SDK configuration options
 */
interface MetaKeepConfigWithUser {
  appId: string;
  user?: MetaKeepUser;
}

/**
 * Wallet response from MetaKeep SDK
 */
interface MetaKeepWalletResponse {
  status: "SUCCESS" | "FAILED";
  wallet: {
    ethAddress?: string;
    solAddress: string;
    eosAddress?: string;
  };
}

/**
 * Solana transaction object
 */
interface SolanaTransaction {
  transaction: string; // Base64 encoded transaction
}

/**
 * Transaction response from MetaKeep SDK
 */
interface TransactionResponse {
  status: "SUCCESS" | "FAILED" | "USER_REQUEST_DENIED" | "USER_CONSENT_DENIED";
  signature?: string;
  transaction?: string; // Base64 encoded signed transaction
  [key: string]: any;
}

/**
 * MetaKeep SDK class
 */
declare class MetaKeep {
  constructor(config: MetaKeepConfigWithUser);

  /**
   * Get wallet address from MetaKeep
   * @returns Promise with wallet response
   */
  getWallet(): Promise<MetaKeepWalletResponse>;

  /**
   * Sign a Solana transaction
   * @param transaction - Solana transaction object
   * @param reason - Reason for signing (shown to user)
   * @returns Promise with signed transaction
   */
  signTransaction(
    transaction: SolanaTransaction,
    reason: string
  ): Promise<TransactionResponse>;
}

export {
  MetaKeep,
  MetaKeepConfigWithUser,
  MetaKeepUser,
  MetaKeepWalletResponse,
  SolanaTransaction,
  TransactionResponse,
};
