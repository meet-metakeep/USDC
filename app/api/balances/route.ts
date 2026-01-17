/**
 * API route handler for fetching Solana token balances
 * Acts as a proxy to the Solana RPC endpoint to avoid CORS issues
 */

import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";

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
 * Handle GET request to fetch balances for a Solana wallet address
 * @param request - Next.js request object containing wallet address as query parameter
 * @returns JSON response with SOL and USDC balances
 */
export async function GET(request: NextRequest) {
  try {
    // Extract wallet address from query parameters
    const searchParams = request.nextUrl.searchParams;
    const address = searchParams.get("address");

    // Validate address parameter
    if (!address) {
      return NextResponse.json(
        { error: "Missing wallet address" },
        { status: 400 }
      );
    }

    // Validate Solana address format
    let publicKey: PublicKey;
    try {
      publicKey = new PublicKey(address);
    } catch {
      return NextResponse.json(
        { error: "Invalid Solana address" },
        { status: 400 }
      );
    }

    // Validate USDC mint address
    if (!USDC_MINT_ADDRESS) {
      return NextResponse.json(
        {
          error: "USDC mint address not configured",
          message:
            "Set NEXT_PUBLIC_USDC_MINT_ADDRESS to a valid mint address.",
        },
        { status: 500 }
      );
    }

    const connection = new Connection(RPC_URL, "confirmed");
    const usdcMint = new PublicKey(USDC_MINT_ADDRESS);

    // Fetch SOL balance
    const solBalanceLamports = await connection.getBalance(publicKey);
    const solBalance = solBalanceLamports / LAMPORTS_PER_SOL;

    // Get associated token account address for USDC
    const tokenAccountAddress = await getAssociatedTokenAddress(
      usdcMint,
      publicKey
    );

    // Fetch USDC balance
    let usdcBalance = 0;
    try {
      const tokenAccountInfo = await getAccount(connection, tokenAccountAddress);
      // USDC has 6 decimals
      usdcBalance = Number(tokenAccountInfo.amount) / 10 ** 6;
    } catch (error) {
      // Token account doesn't exist yet (no USDC balance)
      console.log("Token account not found, balance is 0");
    }

    // Return formatted balances
    return NextResponse.json({
      solBalance: parseFloat(solBalance.toFixed(3)),
      usdcBalance: parseFloat(usdcBalance.toFixed(2)),
    });
  } catch (error) {
    // Log error for debugging
    console.error("Failed to fetch balances:", error);

    // Return error response
    return NextResponse.json(
      {
        error: "Failed to fetch balances",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
