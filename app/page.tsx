"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Send,
  ShoppingCart,
  QrCode,
  User,
  LogOut,
  Mail,
  LogIn,
  CirclePlus,
  ScanLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import QRCode from "qrcode";
import dynamic from "next/dynamic";

/**
 * Dynamically import QR scanner (client-side only)
 */
const QrScanner = dynamic(() => import("@/components/QrScanner"), {
  ssr: false,
});

const EXPLORER_TX_BASE =
  process.env.NEXT_PUBLIC_EXPLORER_TX_BASE ||
  "https://explorer.solana.com/tx/";

type ToastKind = "info" | "success" | "error";
type ToastState = {
  id: number;
  kind: ToastKind;
  message: string;
  actionLabel?: string;
  actionHref?: string;
};

type MetaKeepGetWalletResponse = {
  status: string;
  wallet: { solAddress: string };
  user?: { email?: string };
  email?: string;
};

type MetaKeepSdkLike = {
  user?: { email?: string };
  config?: { user?: { email?: string } };
};

type MetaKeepSignTxResponse = {
  status: string;
  signature?: string;
  transaction?: string;
  [key: string]: any;
};

/**
 * Wallet data interface
 */
interface WalletData {
  address: string;
  email?: string;
  usdcBalance: number;
  solBalance: number;
  usdValue: number;
}

/**
 * Main wallet page component
 */
export default function Home() {
  // Wallet state
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isLoggedOut, setIsLoggedOut] = useState(false);

  // Toast state
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Refs
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  // Dialog states
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [qrScanDialogOpen, setQrScanDialogOpen] = useState(false);
  const [qrScanAddressDialogOpen, setQrScanAddressDialogOpen] = useState(false);

  // Send form state
  const [recipientInput, setRecipientInput] = useState("");
  const [sendAmount, setSendAmount] = useState("1.00");
  const [isSending, setIsSending] = useState(false);
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);

  // QR code state
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  const showToast = useCallback((next: Omit<ToastState, "id">) => {
    setToast({ id: Date.now(), ...next });
  }, []);

  useEffect(() => {
    if (!toast) return;

    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3_000);

    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    };
  }, [toast]);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!showUserMenu) return;

    const onPointerDown = (e: PointerEvent) => {
      const root = userMenuRef.current;
      if (!root) return;
      if (e.target instanceof Node && root.contains(e.target)) return;
      setShowUserMenu(false);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [showUserMenu]);

  // Toast when Receive tab opens
  useEffect(() => {
    if (!receiveDialogOpen) return;
    showToast({
      kind: "info",
      message: wallet
        ? "Copy your address"
        : "Connect your wallet to receive USDC.",
    });
  }, [receiveDialogOpen, wallet, showToast]);

  /**
   * Load cached wallet data from localStorage
   */
  useEffect(() => {
    const cachedWallet = localStorage.getItem("walletData");
    if (cachedWallet && !isLoggedOut) {
      try {
        const walletData = JSON.parse(cachedWallet);
        setWallet(walletData);
        // Refresh balances in the background
        if (walletData?.address) {
          void (async () => {
            const balances = await fetchBalances(walletData.address);
            const next: WalletData = {
              ...walletData,
              solBalance: balances.solBalance,
              usdcBalance: balances.usdcBalance,
              usdValue: balances.usdcBalance,
            };
            setWallet(next);
            localStorage.setItem("walletData", JSON.stringify(next));
          })();
        }
        return;
      } catch (error) {
        console.error("Failed to parse cached wallet:", error);
      }
    }

    // If no cache or logged out, initialize wallet
    if (!isLoggedOut) {
      initWallet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedOut]);

  /**
   * Fetch token balances from Solana devnet via backend proxy
   */
  const fetchBalances = async (address: string) => {
    try {
      const response = await fetch(`/api/balances?address=${address}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            `Failed to fetch balances: ${response.statusText}`
        );
      }

      const balanceData = await response.json();
      return {
        solBalance: balanceData.solBalance || 0,
        usdcBalance: balanceData.usdcBalance || 0,
      };
    } catch (error) {
      console.error("Failed to fetch balances:", error);
      return {
        solBalance: 0,
        usdcBalance: 0,
      };
    }
  };

  /**
   * Initialize MetaKeep SDK and fetch wallet data
   */
  const initWallet = async () => {
    try {
      // Wait for MetaKeep SDK to load
      if (typeof window.MetaKeep === "undefined") {
        setTimeout(initWallet, 100);
        return;
      }

      // Initialize MetaKeep SDK
      const sdk = new window.MetaKeep({
        appId:
          process.env.NEXT_PUBLIC_METAKEEP_APP_ID ||
          "2ff01bae-613c-4c90-a264-eecd14fb0bc0",
      });

      // Get wallet address from MetaKeep
      const response = await sdk.getWallet();

      if (response.status === "SUCCESS") {
        const address = response.wallet.solAddress;

        // Fetch balances from Solana devnet
        const balances = await fetchBalances(address);

        // Extract email from MetaKeep response or cache
        let userEmail: string | undefined;

        const responseSafe = response as unknown as MetaKeepGetWalletResponse;
        if (responseSafe.user?.email) {
          userEmail = responseSafe.user.email;
        } else if (responseSafe.email) {
          userEmail = responseSafe.email;
        }

        // Try to get from SDK instance if available
        if (!userEmail) {
          const sdkSafe = sdk as unknown as MetaKeepSdkLike;
          if (sdkSafe.user?.email) {
            userEmail = sdkSafe.user.email;
          } else if (sdkSafe.config?.user?.email) {
            userEmail = sdkSafe.config.user.email;
          }
        }

        // Check MetaKeep's internal storage
        if (!userEmail) {
          try {
            const metakeepKeys = Object.keys(localStorage).filter(
              (key) =>
                key.toLowerCase().includes("metakeep") ||
                key.toLowerCase().includes("user")
            );
            for (const key of metakeepKeys) {
              try {
                const stored = localStorage.getItem(key);
                if (stored) {
                  const parsed = JSON.parse(stored);
                  if (
                    parsed.email &&
                    typeof parsed.email === "string" &&
                    parsed.email.includes("@")
                  ) {
                    userEmail = parsed.email;
                    break;
                  }
                }
              } catch {
                // Continue checking other keys
              }
            }
          } catch {
            // Ignore errors
          }
        }

        // Check cached data
        if (!userEmail) {
          const cachedData = localStorage.getItem("walletData");
          if (cachedData) {
            try {
              const parsed = JSON.parse(cachedData);
              if (
                parsed.email &&
                parsed.email.includes("@") &&
                !parsed.email.startsWith("User ")
              ) {
                userEmail = parsed.email;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }

        const walletData: WalletData = {
          address,
          email: userEmail,
          usdcBalance: balances.usdcBalance,
          solBalance: balances.solBalance,
          usdValue: balances.usdcBalance, // 1 USDC = 1 USD
        };

        setWallet(walletData);
        // Cache wallet data
        localStorage.setItem("walletData", JSON.stringify(walletData));
      } else {
        console.error("MetaKeep wallet connection failed");
      }
    } catch (error) {
      console.error("Failed to initialize wallet:", error);
    }
  };

  /**
   * Generate QR code for wallet address
   */
  useEffect(() => {
    if (wallet?.address && (receiveDialogOpen || qrScanDialogOpen)) {
      QRCode.toDataURL(wallet.address, {
        width: 300,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      })
        .then(setQrCodeUrl)
        .catch(console.error);
    }
  }, [wallet?.address, receiveDialogOpen, qrScanDialogOpen]);

  /**
   * Check if an error indicates insufficient gas/balance
   */
  const isInsufficientGasError = (error: unknown): boolean => {
    if (typeof error === "string") {
      const errorLower = error.toLowerCase();
      const insufficientGasKeywords = [
        "insufficient funds",
        "insufficient balance",
        "insufficient lamports",
        "not enough",
        "insufficient sol",
      ];
      return insufficientGasKeywords.some((keyword) =>
        errorLower.includes(keyword)
      );
    }

    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      const insufficientGasKeywords = [
        "insufficient funds",
        "insufficient balance",
        "insufficient lamports",
        "not enough",
        "insufficient sol",
      ];
      return insufficientGasKeywords.some((keyword) =>
        errorMessage.includes(keyword)
      );
    }

    return false;
  };

  /**
   * Validate if input is a valid Solana wallet address
   */
  const isValidWalletAddress = (address: string): boolean => {
    // Solana addresses are base58 encoded and typically 32-44 characters
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return solanaAddressRegex.test(address.trim());
  };

  /**
   * Validate if input is a valid email address
   */
  const isValidEmail = (email: string): boolean => {
    const emailRegex =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    const trimmedEmail = email.trim();

    if (trimmedEmail.length > 254) return false;
    if (trimmedEmail.split("@").length !== 2) return false;

    return emailRegex.test(trimmedEmail);
  };

  /**
   * Detect input type and validate
   */
  const detectInputType = (input: string): "address" | "email" | "invalid" => {
    const trimmed = input.trim();

    if (!trimmed) return "invalid";

    // Check if it's an email
    if (trimmed.includes("@")) {
      return isValidEmail(trimmed) ? "email" : "invalid";
    }

    // Check if it's a wallet address
    return isValidWalletAddress(trimmed) ? "address" : "invalid";
  };

  /**
   * Fetch wallet address from email using MetaKeep SDK
   */
  const fetchWalletFromEmail = async (
    email: string
  ): Promise<string | null> => {
    try {
      setIsFetchingAddress(true);

      if (typeof window.MetaKeep === "undefined") {
        throw new Error("MetaKeep SDK not loaded");
      }

      // Initialize MetaKeep SDK with the user parameter
      const sdk = new window.MetaKeep({
        appId:
          process.env.NEXT_PUBLIC_METAKEEP_APP_ID ||
          "2ff01bae-613c-4c90-a264-eecd14fb0bc0",
        user: {
          email: email,
        },
      });

      const response = await sdk.getWallet();

      if (response.status === "SUCCESS" && response.wallet?.solAddress) {
        return response.wallet.solAddress;
      }

      return null;
    } catch (error) {
      console.error("Failed to fetch wallet from email:", error);
      showToast({
        kind: "error",
        message: "Please enter valid email",
      });
      return null;
    } finally {
      setIsFetchingAddress(false);
    }
  };

  /**
   * Handle send USDC tokens with MetaKeep transaction signing
   */
  const handleSend = async () => {
    if (!wallet || !sendAmount || !recipientInput) return;

    // Detect and validate input type
    const inputType = detectInputType(recipientInput);

    if (inputType === "invalid") {
      showToast({
        kind: "error",
        message: "Please enter a valid wallet address or email address",
      });
      return;
    }

    // Get the final recipient address
    let finalRecipientAddress = recipientInput.trim();

    // If input is email, fetch the wallet address first
    if (inputType === "email") {
      const fetchedAddress = await fetchWalletFromEmail(recipientInput.trim());
      if (!fetchedAddress) {
        return;
      }
      finalRecipientAddress = fetchedAddress;

      if (!isValidWalletAddress(finalRecipientAddress)) {
        showToast({
          kind: "error",
          message: "Retrieved address is invalid. Please contact support.",
        });
        return;
      }
    }

    // Validate final address
    if (!isValidWalletAddress(finalRecipientAddress)) {
      showToast({
        kind: "error",
        message: "Invalid wallet address format",
      });
      return;
    }

    try {
      setIsSending(true);
      setSendDialogOpen(false);
      await new Promise((r) => setTimeout(r, 50));

      if (typeof window.MetaKeep === "undefined") {
        throw new Error("MetaKeep SDK not loaded");
      }

      // Initialize MetaKeep SDK
      const sdk = new window.MetaKeep({
        appId:
          process.env.NEXT_PUBLIC_METAKEEP_APP_ID ||
          "2ff01bae-613c-4c90-a264-eecd14fb0bc0",
      });

      // Get SPL token transfer transaction data from API
      const transferDataResponse = await fetch("/api/token-transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: wallet.address,
          to: finalRecipientAddress,
          amount: sendAmount,
        }),
      });

      if (!transferDataResponse.ok) {
        const errorData = await transferDataResponse.json().catch(() => ({}));
        const errorMessage =
          errorData.message || "Failed to create token transfer transaction";
        if (
          isInsufficientGasError(errorMessage) ||
          isInsufficientGasError(errorData)
        ) {
          throw new Error("INSUFFICIENT_GAS");
        }
        throw new Error(errorMessage);
      }

      const transferData = await transferDataResponse.json();

      // Import Solana web3.js dynamically (client-side only)
      const { Connection, PublicKey, VersionedTransaction } = await import(
        "@solana/web3.js"
      );

      // Deserialize the base64 transaction into a VersionedTransaction object
      const transaction = VersionedTransaction.deserialize(
        Buffer.from(transferData.transaction, "base64")
      );

      // Sign transaction using MetaKeep SDK
      // Pass the VersionedTransaction object directly
      // MetaKeep will return the signature in hex format
      const signedTx = await sdk.signTransaction(
        transaction,
        `Send ${sendAmount} USDC to ${
          inputType === "email"
            ? recipientInput.trim()
            : `${finalRecipientAddress.slice(
                0,
                6
              )}...${finalRecipientAddress.slice(-4)}`
        }`
      );

      const signed = signedTx as unknown as MetaKeepSignTxResponse;

      // Log the response for debugging
      console.log("MetaKeep signTransaction response:", {
        status: signed?.status,
        hasSignature: !!signed?.signature,
        signature: signed?.signature,
        allKeys: signed ? Object.keys(signed) : [],
      });

      if (!signed || signed.status !== "SUCCESS") {
        const status = signed?.status || "UNKNOWN";
        if (
          status === "USER_REQUEST_DENIED" ||
          status === "USER_CONSENT_DENIED"
        ) {
          throw new Error("User denied transaction signing");
        }
        throw new Error(`Transaction signing failed (${status})`);
      }

      // Check if MetaKeep returned a signature
      if (!signed.signature) {
        throw new Error("MetaKeep did not return a transaction signature");
      }

      // Parse signature from MetaKeep (hex format with or without 0x prefix)
      let signatureBytes: Buffer;
      const sigStr = String(signed.signature);
      if (sigStr.startsWith("0x")) {
        signatureBytes = Buffer.from(sigStr.slice(2), "hex");
      } else {
        signatureBytes = Buffer.from(sigStr, "hex");
      }

      // Add the signature to the transaction
      transaction.addSignature(
        new PublicKey(wallet.address),
        signatureBytes
      );

      // Broadcast transaction to Solana devnet
      const connection = new Connection(
        "https://api.devnet.solana.com",
        "confirmed"
      );

      // Serialize and send the transaction
      const serializedTx = transaction.serialize();
      const signature = await connection.sendRawTransaction(serializedTx, {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Wait for transaction confirmation
      await connection.confirmTransaction(signature, "confirmed");

      showToast({
        kind: "success",
        message: "Transaction confirmed on Solana!",
        actionLabel: "View",
        actionHref: `${EXPLORER_TX_BASE}${signature}?cluster=devnet`,
      });

      // Reset form
      setRecipientInput("");
      setSendAmount("1.00");

      // Refresh wallet balances
      if (wallet.address) {
        const balances = await fetchBalances(wallet.address);
        setWallet((prev) => {
          if (!prev) return null;
          const next = {
            ...prev,
            solBalance: balances.solBalance,
            usdcBalance: balances.usdcBalance,
            usdValue: balances.usdcBalance,
          };
          localStorage.setItem("walletData", JSON.stringify(next));
          return next;
        });
      }
    } catch (error) {
      console.error("Failed to send transaction:", error);

      if (
        error instanceof Error &&
        (error.message === "INSUFFICIENT_GAS" || isInsufficientGasError(error))
      ) {
        showToast({
          kind: "error",
          message: "Insufficient SOL for gas",
          actionLabel: "Get SOL",
          actionHref: "https://faucet.solana.com/",
        });
      } else {
        showToast({
          kind: "error",
          message: `Send failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
    } finally {
      setIsSending(false);
    }
  };

  /**
   * Copy wallet address to clipboard
   */
  const copyAddress = async () => {
    if (wallet?.address) {
      await navigator.clipboard.writeText(wallet.address);
      showToast({ kind: "success", message: "Address copied to clipboard." });
    }
  };

  /**
   * Handle logout - clear wallet and cache
   */
  const handleLogout = () => {
    setWallet(null);
    setShowUserMenu(false);
    setIsLoggedOut(true);
    localStorage.removeItem("walletData");
  };

  /**
   * Handle login - reinitialize wallet
   */
  const handleLogin = () => {
    setIsLoggedOut(false);
    setShowUserMenu(false);
    initWallet();
  };

  /**
   * Open QR scanner for receive address
   */
  const handleShowReceiveQR = () => {
    setQrScanDialogOpen(true);
  };

  /**
   * Handle QR code scan for recipient address
   */
  const handleQRCodeScan = (scannedAddress: string) => {
    setRecipientInput(scannedAddress);
    setQrScanAddressDialogOpen(false);
  };

  return (
    <main className="min-h-screen wallet-background flex items-center justify-center p-4">
      <div className="w-full max-w-[440px] bg-[#000000] rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.9)] border border-blue-600/20 overflow-hidden">
        {/* Header */}
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center shadow-lg shadow-blue-600/30">
              <span className="text-white font-bold text-lg">U</span>
            </div>
            <h1 className="text-xl font-semibold text-white">USDC Wallet</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-blue-400 hover:bg-white/5 border border-white/10 rounded-xl transition-all"
              onClick={handleShowReceiveQR}
            >
              <QrCode className="w-5 h-5" />
            </Button>
            <div className="relative" ref={userMenuRef}>
              <Button
                variant="ghost"
                size="icon"
                className="text-gray-400 hover:text-blue-400 hover:bg-white/5 border border-white/10 rounded-xl transition-all"
                onClick={() => {
                  if (!wallet) {
                    handleLogin();
                  } else {
                    setShowUserMenu(!showUserMenu);
                  }
                }}
              >
                <User className="w-5 h-5" />
              </Button>

              {/* User dropdown menu */}
              {showUserMenu && wallet && (
                <div className="absolute right-0 mt-2 w-64 bg-[#000000] rounded-xl shadow-xl border border-blue-600/30 z-50 overflow-hidden">
                  <div className="p-4 border-b border-white/10">
                    <div className="flex items-center gap-2 text-sm text-gray-300">
                      <Mail className="w-4 h-4" />
                      <span className="truncate">
                        {wallet.email || "Email not available"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full p-3 flex items-center gap-2 text-red-400 hover:bg-white/5 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm font-medium">Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Balance Section */}
        <div className="p-6 text-center">
          <p className="text-gray-400 text-sm mb-2 font-medium">
            Total Balance
          </p>
          <h2 className="text-5xl font-bold text-white mb-3">
            ${wallet?.usdcBalance?.toFixed(0) ?? "0"}
          </h2>
          <div className="flex items-center justify-center gap-2">
            <span className="text-blue-400 font-semibold">
              {wallet?.usdcBalance?.toFixed(2) ?? "0.00"} USDC
            </span>
            <span className="text-gray-500">
              ≈ ${wallet?.usdValue?.toFixed(2) ?? "0.00"}
            </span>
          </div>
        </div>

        {/* Get USDC Button */}
        <div className="px-6 mb-4">
          <Button
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:opacity-90 text-white font-semibold py-5 rounded-2xl text-base shadow-lg shadow-blue-600/30 transition-all"
            onClick={() =>
              showToast({
                kind: "info",
                message: "USDC deployed on Solana Devnet!",
              })
            }
          >
            <ShoppingCart className="w-5 h-5 mr-2" />
            GET USDC
          </Button>
        </div>

        {/* Send & Receive Buttons */}
        <div className="px-6 mb-6 grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="bg-[#2A2A2A] border-white/10 hover:border-blue-600 hover:bg-white/5 text-white py-5 rounded-2xl transition-all"
            onClick={() => {
              if (wallet && (wallet.usdcBalance ?? 0) <= 0) {
                showToast({
                  kind: "error",
                  message: "Get USDC to send",
                });
                return;
              }
              setSendDialogOpen(true);
            }}
            disabled={!wallet}
          >
            <Send className="w-4 h-4 mr-2" />
            Send
          </Button>
          <Button
            variant="outline"
            className="bg-[#2A2A2A] border-white/10 hover:border-blue-600 hover:bg-white/5 text-white py-5 rounded-2xl transition-all"
            onClick={() => setReceiveDialogOpen(true)}
            disabled={!wallet}
          >
            <CirclePlus className="w-4 h-4 mr-2" />
            Receive
          </Button>
        </div>

        {/* Your Assets Section */}
        <div className="px-6 pb-6">
          <h3 className="text-white font-semibold mb-4">Your Assets</h3>

          {/* USDC Token */}
          <div className="bg-[#2A2A2A] rounded-2xl p-4 mb-3 flex items-center justify-between border border-white/10 hover:border-blue-600/50 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-400 flex items-center justify-center shadow-md">
                <span className="text-white font-bold text-lg">U</span>
              </div>
              <div>
                <p className="text-white font-semibold">USDC</p>
                <p className="text-gray-400 text-sm">USD Stablecoin</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white font-semibold">
                {wallet?.usdcBalance?.toFixed(2) ?? "0.00"}
              </p>
              <p className="text-gray-400 text-sm">
                ${wallet?.usdValue?.toFixed(2) ?? "0.00"}
              </p>
            </div>
          </div>

          {/* SOL Token */}
          <div className="bg-[#2A2A2A] rounded-2xl p-4 mb-4 flex items-center justify-between border border-white/10 hover:border-purple-500/50 transition-all">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center shadow-md shadow-purple-600/20">
                <span className="text-white font-semibold text-sm">◎</span>
              </div>
              <div>
                <p className="text-white font-semibold">SOL</p>
                <p className="text-gray-400 text-sm">Network token</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-white font-semibold">
                {wallet?.solBalance?.toFixed(3) ?? "0.000"}
              </p>
              <p className="text-gray-400 text-sm">
                {wallet?.solBalance && wallet.solBalance > 0
                  ? `$${(wallet.solBalance * 100).toFixed(2)}`
                  : "$0.00"}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="bg-[#2A2A2A] border-white/10 hover:border-purple-500 hover:bg-white/5 text-white py-5 rounded-2xl transition-all"
              onClick={() =>
                window.open("https://faucet.solana.com/", "_blank")
              }
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Get SOL
            </Button>
            <Button
              variant="outline"
              className="bg-[#2A2A2A] border-white/10 hover:border-blue-600 hover:bg-white/5 text-white py-5 rounded-2xl transition-all"
              onClick={() => {
                showToast({
                  kind: "info",
                  message: "Coming Soon",
                });
              }}
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                />
              </svg>
              Swap SOL
            </Button>
          </div>
        </div>

        {/* Send Dialog */}
        <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
          <DialogContent className="bg-[#2A2A2A] border-blue-600/30 text-white max-w-[380px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-white">
                Send USDC
              </DialogTitle>
            </DialogHeader>
            {wallet && (wallet.usdcBalance ?? 0) <= 0 ? (
              <div className="space-y-4 pt-2 text-center py-6">
                <p className="text-gray-400 mb-4">
                  You don&apos;t have any USDC to send. Get some first!
                </p>
                <Button
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:opacity-90 text-white font-semibold py-5 text-base rounded-2xl shadow-lg shadow-blue-600/30 transition-all"
                  onClick={() => {
                    setSendDialogOpen(false);
                    showToast({
                      kind: "info",
                      message: "USDC deployed on Solana Devnet!",
                    });
                  }}
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  GET USDC
                </Button>
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                <Button
                  variant="outline"
                  className="w-full bg-[#2A2A2A] border-white/10 hover:border-blue-600 hover:bg-white/5 text-white py-5 rounded-2xl transition-all"
                  onClick={() => setQrScanAddressDialogOpen(true)}
                >
                  <ScanLine className="w-5 h-5 mr-2" />
                  Scan QR Code
                </Button>

                <div>
                  <label className="text-sm text-gray-400 block mb-2 font-medium">
                    Recipient Wallet Address or Email
                  </label>
                  <Input
                    placeholder="Solana address or satoshi@example.com"
                    value={recipientInput}
                    onChange={(e) => setRecipientInput(e.target.value)}
                    className="bg-[#2A2A2A] border-white/10 focus:border-blue-600 text-white placeholder:text-gray-500 h-11 rounded-xl transition-all"
                  />
                </div>

                <div>
                  <label className="text-sm text-gray-400 block mb-2 font-medium">
                    Amount (USDC)
                  </label>
                  <Input
                    placeholder="1.00"
                    type="number"
                    step="0.01"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    className="bg-[#2A2A2A] border-white/10 focus:border-blue-600 text-white placeholder:text-gray-500 h-11 text-lg font-semibold rounded-xl transition-all"
                  />
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:opacity-90 text-white font-semibold py-5 text-base rounded-2xl shadow-lg shadow-blue-600/30 transition-all"
                  onClick={handleSend}
                  disabled={
                    !recipientInput ||
                    !sendAmount ||
                    isSending ||
                    isFetchingAddress
                  }
                >
                  {isSending || isFetchingAddress
                    ? "Processing..."
                    : "Send USDC"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Receive Dialog */}
        <Dialog open={receiveDialogOpen} onOpenChange={setReceiveDialogOpen}>
          <DialogContent className="bg-[#2A2A2A] border-blue-600/30 text-white max-w-[360px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-white">
                Receive USDC
              </DialogTitle>
            </DialogHeader>
            {wallet ? (
              <div className="space-y-3 pt-2">
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="bg-white p-3 rounded-xl shadow-lg">
                    {qrCodeUrl && (
                      <Image
                        src={qrCodeUrl}
                        alt="Wallet QR Code"
                        width={200}
                        height={200}
                        className="rounded"
                      />
                    )}
                  </div>
                </div>

                {/* Wallet Address */}
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-3 break-all px-2 font-mono">
                    {wallet.address}
                  </p>
                  <Button
                    variant="outline"
                    className="bg-[#2A2A2A] border-white/10 hover:border-blue-600 hover:bg-white/5 text-white w-full rounded-2xl transition-all"
                    onClick={copyAddress}
                  >
                    <QrCode className="w-4 h-4 mr-2" />
                    Copy Address
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-2 text-center py-8">
                <p className="text-gray-400 mb-4">
                  Please connect your wallet to receive tokens
                </p>
                <Button
                  className="bg-gradient-to-r from-blue-600 to-blue-500 hover:opacity-90 text-white rounded-2xl shadow-lg shadow-blue-600/30 transition-all"
                  onClick={() => {
                    setReceiveDialogOpen(false);
                    handleLogin();
                  }}
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Connect Wallet
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* QR Scanner Dialog for Wallet Address */}
        <Dialog open={qrScanDialogOpen} onOpenChange={setQrScanDialogOpen}>
          <DialogContent className="bg-[#2A2A2A] border-blue-600/30 text-white max-w-[360px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold text-white">
                Your Wallet QR Code
              </DialogTitle>
            </DialogHeader>
            {wallet ? (
              <div className="space-y-4 pt-2">
                {/* QR Code */}
                <div className="flex justify-center">
                  <div className="bg-white p-3 rounded-xl shadow-lg">
                    {qrCodeUrl && (
                      <Image
                        src={qrCodeUrl}
                        alt="Wallet QR Code"
                        width={200}
                        height={200}
                        className="rounded"
                      />
                    )}
                  </div>
                </div>

                {/* Wallet Address */}
                <div className="text-center">
                  <p className="text-xs text-gray-400 mb-3 break-all px-2 font-mono">
                    {wallet.address}
                  </p>
                  <Button
                    variant="outline"
                    className="bg-[#2A2A2A] border-white/10 hover:border-blue-600 hover:bg-white/5 text-white w-full rounded-2xl transition-all"
                    onClick={copyAddress}
                  >
                    <QrCode className="w-4 h-4 mr-2" />
                    Copy Address
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-2 text-center py-8">
                <p className="text-gray-400 mb-4">
                  Please connect your wallet to view QR code
                </p>
                <Button
                  className="bg-gradient-to-r from-blue-600 to-blue-500 hover:opacity-90 text-white rounded-2xl shadow-lg shadow-blue-600/30 transition-all"
                  onClick={() => {
                    setQrScanDialogOpen(false);
                    handleLogin();
                  }}
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Connect Wallet
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* QR Scanner Dialog for Recipient Address */}
        <Dialog
          open={qrScanAddressDialogOpen}
          onOpenChange={setQrScanAddressDialogOpen}
        >
          <DialogContent className="bg-[#2A2A2A] border-blue-600/30 text-white max-w-[400px] rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-white">
                Scan Recipient QR Code
              </DialogTitle>
            </DialogHeader>
            <div className="pt-4">
              <QrScanner onScan={handleQRCodeScan} />
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Bottom toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] w-[min(520px,calc(100vw-24px))] -translate-x-1/2">
          <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border border-blue-600/30 bg-[#2A2A2A]/95 px-4 py-3 shadow-[0_16px_60px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            <div className="min-w-0">
              <p className="text-sm text-gray-100 truncate">{toast.message}</p>
            </div>
            <div className="flex items-center gap-2">
              {toast.actionHref && toast.actionLabel && (
                <a
                  href={toast.actionHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-400 hover:text-blue-500 underline underline-offset-4 whitespace-nowrap transition-colors"
                >
                  {toast.actionLabel}
                </a>
              )}
              <button
                onClick={() => setToast(null)}
                className="text-xs text-gray-400 hover:text-gray-200 whitespace-nowrap transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
