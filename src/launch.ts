import { encodeFunctionData, getAddress, isAddress, parseAbi, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { postJson } from "./api.js";
import { getChain, getClient } from "./config.js";

const FACTORY_ABI = parseAbi([
  "function createLaunchDirectV3Vanity(string name, string symbol, uint256 tokenSupply, uint256 holderShareBps, uint256 burnShareBps, uint256 creatorBuyFeeBps, uint256 creatorSellFeeBps, int24 startTick, address quoteAsset, uint256 minTokensOut, bytes32 salt, uint8 suffixLength, uint32 suffixValue) payable returns (address token, address buybackAdapter)",
]);
const EXECUTOR_ABI = parseAbi([
  "function quoteAssetConfigs(address) view returns (bool approved, uint256 graduationThreshold, uint256 virtualReserve)",
]);

export interface LaunchInput {
  chainId: number;
  creator: string;
  name: string;
  symbol: string;
  tokenSupply: string; // whole tokens
  holderShareBps: number;
  burnShareBps: number;
  creatorBuyFeeBps: number;
  creatorSellFeeBps: number;
  quoteAsset?: string;
  firstBuy?: string; // decimal amount of the native coin, e.g. "0.05"
  suffix?: string;
}

export async function prepareLaunch(i: LaunchInput) {
  const chain = getChain(i.chainId);
  if (!isAddress(i.creator)) throw new Error("creator must be a valid address.");
  const creator = getAddress(i.creator.toLowerCase());
  const quote: Address = i.quoteAsset && i.quoteAsset.toLowerCase() !== zeroAddress ? getAddress(i.quoteAsset.toLowerCase()) : zeroAddress;

  const supplyRaw = parseUnits(i.tokenSupply, 18);
  if (supplyRaw < parseUnits("1000000", 18) || supplyRaw > parseUnits("1000000000000", 18)) {
    throw new Error("tokenSupply must be between 1,000,000 and 1,000,000,000,000 whole tokens.");
  }
  for (const [k, v, max] of [
    ["holderShareBps", i.holderShareBps, 10000], ["burnShareBps", i.burnShareBps, 10000],
    ["creatorBuyFeeBps", i.creatorBuyFeeBps, 1000], ["creatorSellFeeBps", i.creatorSellFeeBps, 1000],
  ] as const) {
    if (!Number.isInteger(v) || v < 0 || v > max) throw new Error(`${k} must be an integer from 0 to ${max}.`);
  }
  const suffix = (i.suffix ?? "c0de").toLowerCase();
  if (!/^[0-9a-f]{3,5}$/.test(suffix)) throw new Error("suffix must be 3 to 5 hex characters.");

  const value = i.firstBuy ? parseUnits(i.firstBuy, 18) : 0n;
  if (value > 0n && quote !== zeroAddress) throw new Error("firstBuy is only supported for native-coin pairs (leave quoteAsset empty).");

  const client = getClient(chain);

  // 1. Reserve
  let reserveRaw = chain.nativeReserveRaw;
  if (quote !== zeroAddress) {
    const [approved, , virtualReserve] = await client.readContract({
      address: chain.executor, abi: EXECUTOR_ABI, functionName: "quoteAssetConfigs", args: [quote],
    });
    if (!approved) throw new Error(`Quote asset ${quote} is not approved on ${chain.name}. Use get_quote_assets.`);
    reserveRaw = virtualReserve;
  }

  // 2. Mine salt (predicts the token address)
  const mined = (await postJson("/api/vanity/mine", {
    creator, name: i.name, symbol: i.symbol, tokenSupply: supplyRaw.toString(), suffix, factory: chain.factory,
  })) as { salt: Hex; address: Address };
  if (!mined?.salt || !mined?.address) throw new Error("Unexpected response from /api/vanity/mine.");
  const token = getAddress(mined.address.toLowerCase());

  // 3. Start tick (orientation rule from the Kosmo agent docs)
  const quoteFirst = quote === zeroAddress || BigInt(quote) < BigInt(token);
  const ratio = quoteFirst ? Number(supplyRaw) / Number(reserveRaw) : Number(reserveRaw) / Number(supplyRaw);
  const startTick = Math.floor(Math.log(ratio) / Math.log(1.0001));

  // 4. Safety minimum for the creator's first buy: a quarter of the naive estimate.
  let minTokensOut = 0n;
  if (value > 0n) {
    const naive = quoteFirst ? (value * supplyRaw) / reserveRaw : (value * supplyRaw) / reserveRaw;
    minTokensOut = naive / 4n;
  }

  const suffixValue = parseInt(suffix, 16);
  const args = [
    i.name, i.symbol, supplyRaw, BigInt(i.holderShareBps), BigInt(i.burnShareBps),
    BigInt(i.creatorBuyFeeBps), BigInt(i.creatorSellFeeBps), startTick, quote, minTokensOut,
    mined.salt, suffix.length, suffixValue,
  ] as const;

  // 5. Simulate (free). Must succeed and create the mined address.
  const sim = await client.simulateContract({
    address: chain.factory, abi: FACTORY_ABI, functionName: "createLaunchDirectV3Vanity", args, account: creator, value,
  });
  const simulatedToken = sim.result[0];
  if (simulatedToken.toLowerCase() !== token.toLowerCase()) {
    throw new Error(`Simulation created ${simulatedToken}, not the mined ${token}. Do not send. Re-run prepare_launch.`);
  }

  const data = encodeFunctionData({ abi: FACTORY_ABI, functionName: "createLaunchDirectV3Vanity", args });
  return {
    chainId: chain.id,
    chainName: chain.name,
    predictedToken: token,
    startTick,
    quoteAsset: quote,
    transaction: { from: creator, to: chain.factory, data, value: value.toString(), gasLimit: "9000000" },
    simulation: "passed",
    summary: {
      name: i.name, symbol: i.symbol, tokenSupply: i.tokenSupply,
      holderShareBps: i.holderShareBps, burnShareBps: i.burnShareBps,
      creatorBuyFeeBps: i.creatorBuyFeeBps, creatorSellFeeBps: i.creatorSellFeeBps,
      firstBuy: i.firstBuy ?? "0",
    },
    warnings: [
      "Creator fees are fixed permanently at launch. Show this summary to the wallet owner and get their confirmation before signing.",
      "If name, symbol, supply, creator or any setting changes, call prepare_launch again: the token address and start tick change.",
      "The wallet that sends this transaction becomes the creator.",
    ],
    nextSteps: [
      "Sign and send `transaction` from the creator wallet, then wait for the receipt.",
      "Call prepare_metadata_message with the predictedToken, sign the message, then upload_logo and save_metadata.",
      "Call prepare_metadata_message again for a fresh signature and lock_metadata last (optional, permanent).",
    ],
  };
}
