/**
 * API route handler for USDC faucet claims
 * Transfers USDC from faucet wallet to requesting user
 * 
 * COMMENTED OUT: Faucet functionality disabled
 */

/*
import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";

// Runtime configuration for Node.js environment
export const runtime = "nodejs";

/**
 * Solana Devnet RPC endpoint
 */
const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.devnet.solana.com";

/**
 * USDC mint address on Solana devnet
 */
const USDC_MINT_ADDRESS =
  process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS ||
  "6a3ytKTopkEyymNB1MsKkGKUHP6J3oafHMzkSBpTKRfd";

/**
 * Solana Explorer URL
 */
const EXPLORER_TX_BASE =
  process.env.NEXT_PUBLIC_EXPLORER_TX_BASE ||
  "https://explorer.solana.com/tx/";

/**
 * Request body type
 */
type ClaimBody = {
  address?: string;
  amount?: number;
};

/**
 * Transaction reference type
 */
type TxRef = { hash: string; url: string };

/**
 * Error details type
 */
type ErrorDetails = {
  code?: string;
  message?: string;
  faucetAddress?: string;
  faucetBalance?: string;
  rpcUrl?: string;
};

/**
 * Helper to get environment variable
 */
function env(name: string): string | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : undefined;
}

/**
 * Helper to create transaction reference with explorer URL
 */
function toTxRef(explorerTxBase: string, hash: string): TxRef {
  const base = explorerTxBase.endsWith("/")
    ? explorerTxBase
    : `${explorerTxBase}/`;
  return { hash, url: `${base}${hash}?cluster=devnet` };
}

/**
 * Format error message
 */
function formatError(e: unknown): { error: string; details?: ErrorDetails } {
  if (!(e instanceof Error)) return { error: "Unknown error." };
  const msg = e.message || "Request failed.";

  // Check for insufficient funds error
  if (/insufficient funds/i.test(msg) || /insufficient lamports/i.test(msg)) {
    return {
      error:
        "Faucet wallet has insufficient SOL to pay gas fees. Please fund the faucet wallet with SOL.",
      details: { code: "INSUFFICIENT_FUNDS", message: msg },
    };
  }

  return { error: msg, details: { message: msg } };
}

/**
 * Get client IP address from request headers
 */
function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return "unknown";
  return xff.split(",")[0]?.trim() || "unknown";
}

/**
 * In-memory rate limiting (per serverless instance)
 */
const recentByKey = new Map<string, number>();
const COOLDOWN_MS = 60_000; // 1 minute cooldown

/**
 * Rate limit check
 */
function rateLimit(key: string) {
  const now = Date.now();
  const prev = recentByKey.get(key);
  if (prev && now - prev < COOLDOWN_MS) {
    const waitMs = COOLDOWN_MS - (now - prev);
    throw new Error(`Rate limited. Try again in ${Math.ceil(waitMs / 1000)}s.`);
  }
  recentByKey.set(key, now);
}

/**
 * Validate Solana address
 */
function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * POST handler for faucet claims
 */
export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = (await req.json()) as ClaimBody;
    const to = body.address?.trim();
    const amount = body.amount;

    // Validate address
    if (!to || !isValidSolanaAddress(to)) {
      return NextResponse.json(
        { ok: false, error: "Invalid Solana address." },
        { status: 400 }
      );
    }

    // Validate amount (2, 5, or 10 USDC)
    if (amount !== 2 && amount !== 5 && amount !== 10) {
      return NextResponse.json(
        { ok: false, error: "Amount must be one of: 2, 5, 10." },
        { status: 400 }
      );
    }

    // Rate limiting by IP and address
    const ip = getClientIp(req);
    rateLimit(`ip:${ip}`);
    rateLimit(`addr:${to.toLowerCase()}`);

    // Get faucet private key from environment
    const pk = env("FAUCET_PRIVATE_KEY");
    if (!pk) {
      return NextResponse.json(
        { ok: false, error: "Server misconfigured: missing FAUCET_PRIVATE_KEY." },
        { status: 500 }
      );
    }

    // Parse private key (comma-separated array of numbers)
    let faucetKeypair: Keypair;
    try {
      const secretKeyArray = pk.split(",").map((num) => parseInt(num.trim()));
      faucetKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
    } catch {
      return NextResponse.json(
        { ok: false, error: "Server misconfigured: invalid FAUCET_PRIVATE_KEY format." },
        { status: 500 }
      );
    }

    // Connect to Solana
    const connection = new Connection(RPC_URL, "confirmed");
    const usdcMint = new PublicKey(USDC_MINT_ADDRESS);
    const recipientPublicKey = new PublicKey(to);

    // Get associated token accounts
    const faucetTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      faucetKeypair.publicKey
    );
    const recipientTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      recipientPublicKey
    );

    // Check faucet balance
    const faucetBalance = await connection.getBalance(faucetKeypair.publicKey);
    if (faucetBalance === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Faucet wallet has no SOL for transaction fees.",
          details: {
            faucetAddress: faucetKeypair.publicKey.toString(),
            faucetBalance: "0 SOL",
          },
        },
        { status: 500 }
      );
    }

    // Build transaction instructions
    const instructions = [];

    // Check if recipient's token account exists
    let recipientAccountExists = false;
    try {
      await getAccount(connection, recipientTokenAccount);
      recipientAccountExists = true;
    } catch {
      recipientAccountExists = false;
    }

    // Create recipient's token account if needed
    if (!recipientAccountExists) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          faucetKeypair.publicKey, // Payer
          recipientTokenAccount, // Associated token account address
          recipientPublicKey, // Owner
          usdcMint // Mint
        )
      );
    }

    // Add transfer instruction (USDC has 6 decimals)
    const transferAmount = amount * 10 ** 6;
    instructions.push(
      createTransferInstruction(
        faucetTokenAccount, // Source token account
        recipientTokenAccount, // Destination token account
        faucetKeypair.publicKey, // Owner
        transferAmount // Amount in smallest unit
      )
    );

    // Get latest blockhash
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    // Create and sign transaction
    const transaction = new Transaction().add(...instructions);
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = faucetKeypair.publicKey;

    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [faucetKeypair],
      {
        commitment: "confirmed",
        skipPreflight: false,
      }
    );

    // Return success response
    return NextResponse.json({
      ok: true,
      rpcUrl: RPC_URL,
      explorerTxBase: EXPLORER_TX_BASE,
      recipient: to,
      amountUsdc: String(amount),
      usdcTx: toTxRef(EXPLORER_TX_BASE, signature),
      faucetAddress: faucetKeypair.publicKey.toString(),
    });
  } catch (e) {
    // Error handling with diagnostics
    let details: ErrorDetails | undefined;
    try {
      const pk = env("FAUCET_PRIVATE_KEY");
      if (pk) {
        const secretKeyArray = pk.split(",").map((num) => parseInt(num.trim()));
        const faucetKeypair = Keypair.fromSecretKey(
          Uint8Array.from(secretKeyArray)
        );
        const connection = new Connection(RPC_URL, "confirmed");
        const bal = await connection.getBalance(faucetKeypair.publicKey);
        details = {
          faucetAddress: faucetKeypair.publicKey.toString(),
          faucetBalance: `${bal / 10 ** 9} SOL`,
          rpcUrl: RPC_URL,
        };
      } else {
        details = { rpcUrl: RPC_URL };
      }
    } catch {
      // Ignore diagnostics failures
    }

    const formatted = formatError(e);
    return NextResponse.json(
      { ok: false, ...formatted, details: { ...details, ...formatted.details } },
      { status: 500 }
    );
  }
}
*/
