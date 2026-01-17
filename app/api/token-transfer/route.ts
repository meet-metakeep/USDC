/**
 * API route handler for creating SPL token transfer transactions
 * Returns a serialized transaction for MetaKeep to sign
 */

import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";

/**
 * Solana Devnet RPC endpoint
 */
const RPC_URL =
  process.env.SOLANA_RPC_URL ||
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
  "https://api.devnet.solana.com";

/**
 * USDC mint address on Solana devnet
 * Updated to use devnet USDC token: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
 */
const USDC_MINT_ADDRESS =
  process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS ||
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/**
 * Handle POST request to create a USDC transfer transaction
 * @param request - Next.js request object with from, to, and amount
 * @returns JSON response with serialized transaction
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { from, to, amount } = body;

    // Validate required fields
    if (!from || !to || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: from, to, amount" },
        { status: 400 }
      );
    }

    // Validate Solana addresses
    let fromPublicKey: PublicKey;
    let toPublicKey: PublicKey;
    try {
      fromPublicKey = new PublicKey(from);
      toPublicKey = new PublicKey(to);
    } catch {
      return NextResponse.json(
        { error: "Invalid Solana address format" },
        { status: 400 }
      );
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { error: "Invalid amount" },
        { status: 400 }
      );
    }

    // Validate USDC mint address
    if (!USDC_MINT_ADDRESS) {
      return NextResponse.json(
        {
          error: "USDC mint address not configured",
          message: "Set NEXT_PUBLIC_USDC_MINT_ADDRESS to a valid mint address.",
        },
        { status: 500 }
      );
    }

    const connection = new Connection(RPC_URL, "confirmed");
    const usdcMint = new PublicKey(USDC_MINT_ADDRESS);

    // Get associated token accounts
    const fromTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      fromPublicKey
    );
    const toTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      toPublicKey
    );

    // Build transaction instructions
    const instructions = [];

    // Check if recipient's token account exists
    let recipientAccountExists = false;
    try {
      await getAccount(connection, toTokenAccount);
      recipientAccountExists = true;
    } catch {
      // Account doesn't exist, we'll need to create it
      recipientAccountExists = false;
    }

    // Add instruction to create recipient's token account if needed
    if (!recipientAccountExists) {
      instructions.push(
        createAssociatedTokenAccountInstruction(
          fromPublicKey, // Payer
          toTokenAccount, // Associated token account address
          toPublicKey, // Owner
          usdcMint // Mint
        )
      );
    }

    // Add transfer instruction
    // Convert amount to smallest unit (USDC has 6 decimals)
    const transferAmount = Math.floor(amountNum * 10 ** 6);

    instructions.push(
      createTransferInstruction(
        fromTokenAccount, // Source token account
        toTokenAccount, // Destination token account
        fromPublicKey, // Owner
        transferAmount // Amount in smallest unit
      )
    );

    // Get latest blockhash
    const { blockhash } = await connection.getLatestBlockhash("finalized");

    // Create versioned transaction message
    const messageV0 = new TransactionMessage({
      payerKey: fromPublicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    // Create versioned transaction
    const transaction = new VersionedTransaction(messageV0);

    // Serialize transaction for MetaKeep
    const serializedTransaction = Buffer.from(transaction.serialize()).toString(
      "base64"
    );

    return NextResponse.json({
      transaction: serializedTransaction,
      message: `Transfer ${amount} USDC`,
    });
  } catch (error) {
    console.error("Failed to create transfer transaction:", error);

    return NextResponse.json(
      {
        error: "Failed to create transfer transaction",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
