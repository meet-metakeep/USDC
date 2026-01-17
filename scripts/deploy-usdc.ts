/**
 * Deploy USDC Token on Solana Devnet
 * This script creates a new SPL token with 1,000,000 USDC supply
 */

import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main deployment function
 */
async function main() {
  console.log("🚀 Starting USDC Token Deployment on Solana Devnet...\n");

  // Connect to Solana devnet
  const connection = new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com",
    "confirmed"
  );

  // Generate or load deployer keypair
  let deployerKeypair: Keypair;
  const keyPath = path.join(__dirname, "../.deployer-key.json");

  if (fs.existsSync(keyPath)) {
    console.log("📂 Loading existing deployer keypair...");
    const secretKey = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    deployerKeypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));
  } else {
    console.log("🔑 Generating new deployer keypair...");
    deployerKeypair = Keypair.generate();
    fs.writeFileSync(
      keyPath,
      JSON.stringify(Array.from(deployerKeypair.secretKey))
    );
  }

  console.log(`📍 Deployer Public Key: ${deployerKeypair.publicKey.toString()}`);

  // Check balance
  let balance = await connection.getBalance(deployerKeypair.publicKey);
  console.log(`💰 Current Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  // Request airdrop if balance is low
  if (balance < 0.1 * LAMPORTS_PER_SOL) {
    console.log("\n💧 Requesting airdrop (2 SOL)...");
    try {
      const airdropSignature = await connection.requestAirdrop(
        deployerKeypair.publicKey,
        2 * LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdropSignature);
      balance = await connection.getBalance(deployerKeypair.publicKey);
      console.log(`✅ Airdrop successful! New Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    } catch (error) {
      console.error("❌ Airdrop failed:", error);
      console.log("\n⚠️  Please manually fund this address using the Solana faucet:");
      console.log(`   https://faucet.solana.com/`);
      console.log(`   Address: ${deployerKeypair.publicKey.toString()}`);
      process.exit(1);
    }
  }

  // Create USDC mint
  console.log("\n🪙 Creating USDC Token Mint...");
  const mint = await createMint(
    connection,
    deployerKeypair,
    deployerKeypair.publicKey, // Mint authority
    deployerKeypair.publicKey, // Freeze authority
    6 // Decimals (USDC uses 6 decimals)
  );

  console.log(`✅ USDC Mint Created: ${mint.toString()}`);

  // Create token account for deployer
  console.log("\n💼 Creating Token Account...");
  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    deployerKeypair,
    mint,
    deployerKeypair.publicKey
  );

  console.log(`✅ Token Account: ${tokenAccount.address.toString()}`);

  // Mint 1,000,000 USDC tokens
  console.log("\n💎 Minting 1,000,000 USDC...");
  const mintAmount = 1_000_000 * 10 ** 6; // 1 million with 6 decimals
  await mintTo(
    connection,
    deployerKeypair,
    mint,
    tokenAccount.address,
    deployerKeypair.publicKey,
    mintAmount
  );

  console.log(`✅ Minted 1,000,000 USDC to ${tokenAccount.address.toString()}`);

  // Save mint address to .env.local
  const envPath = path.join(__dirname, "../.env.local");
  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
  }

  // Update or add USDC_MINT_ADDRESS
  if (envContent.includes("NEXT_PUBLIC_USDC_MINT_ADDRESS=")) {
    envContent = envContent.replace(
      /NEXT_PUBLIC_USDC_MINT_ADDRESS=.*/,
      `NEXT_PUBLIC_USDC_MINT_ADDRESS=${mint.toString()}`
    );
  } else {
    envContent += `\nNEXT_PUBLIC_USDC_MINT_ADDRESS=${mint.toString()}\n`;
  }

  // Update or add SOLANA_DEPLOYER_PRIVATE_KEY
  const privateKeyBase58 = Array.from(deployerKeypair.secretKey).join(",");
  if (envContent.includes("SOLANA_DEPLOYER_PRIVATE_KEY=")) {
    envContent = envContent.replace(
      /SOLANA_DEPLOYER_PRIVATE_KEY=.*/,
      `SOLANA_DEPLOYER_PRIVATE_KEY=${privateKeyBase58}`
    );
  } else {
    envContent += `SOLANA_DEPLOYER_PRIVATE_KEY=${privateKeyBase58}\n`;
  }

  fs.writeFileSync(envPath, envContent);

  console.log("\n✅ Deployment Complete!");
  console.log("\n📋 Summary:");
  console.log(`   Mint Address: ${mint.toString()}`);
  console.log(`   Deployer: ${deployerKeypair.publicKey.toString()}`);
  console.log(`   Token Account: ${tokenAccount.address.toString()}`);
  console.log(`   Supply: 1,000,000 USDC`);
  console.log(`\n🔗 View on Solana Explorer:`);
  console.log(`   https://explorer.solana.com/address/${mint.toString()}?cluster=devnet`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });
