/**
 * API route handler for USDC faucet claims
 * 
 * DISABLED: Faucet functionality has been disabled.
 * Users should use https://faucet.circle.com/ to get testnet USDC.
 */

import { NextRequest, NextResponse } from "next/server";

// Runtime configuration for Node.js environment
export const runtime = "nodejs";

/**
 * POST handler for faucet claims
 * Returns an error indicating the faucet is disabled
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Faucet functionality is disabled. Please use https://faucet.circle.com/ to get testnet USDC on Solana Devnet.",
    },
    { status: 503 }
  );
}
