import { createPublicClient, defineChain, http, type Address, type Chain, type PublicClient } from "viem";
import { base, bsc, ink, mainnet } from "viem/chains";

export interface KosmoChain {
  id: number;
  name: string;
  nativeSymbol: string;
  factory: Address;
  executor: Address;
  hook: Address;
  /** Fixed opening reserve for native-coin pairs (raw, 18 decimals). */
  nativeReserveRaw: bigint;
  chain: Chain;
}

const ETH_RESERVE = 1391772000000000000n; // 1.391772 ETH
const BNB_RESERVE = 4390000000000000000n; // 4.39 BNB

const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [] } },
});

// Addresses: https://kosmoprotocol.com/docs/agents.md (Addresses section).
export const CHAINS: KosmoChain[] = [
  {
    id: 1, name: "Ethereum", nativeSymbol: "ETH", nativeReserveRaw: ETH_RESERVE, chain: mainnet,
    factory: "0x3fdf7f1d5d55e23b82561dd9c516f8d004cd9cdf",
    executor: "0x1a7b62062974c77f1f7e42e44fafe560dd717d65",
    hook: "0xe8e8e960bb82512d5dc8addc13f8bec12a9aa0cc",
  },
  {
    id: 56, name: "BNB Chain", nativeSymbol: "BNB", nativeReserveRaw: BNB_RESERVE, chain: bsc,
    factory: "0x53a8e730961fdd1c94878eb1e90235b1eb2e4377",
    executor: "0xa66ab745e14a8ee1ae972c5e527ba9a0d78d0564",
    hook: "0xd5388e2a16ec0a515713eed5f373262553a860cc",
  },
  {
    id: 8453, name: "Base", nativeSymbol: "ETH", nativeReserveRaw: ETH_RESERVE, chain: base,
    factory: "0x0c451c9c26608cc66c88ca699bf669bc489b895a",
    executor: "0xd50ff696e05cf03a7c65b3260a52e76477260ae3",
    hook: "0x9a8150e581e6cb3268d1db56851d74b36c39a0cc",
  },
  {
    id: 4663, name: "Robinhood Chain", nativeSymbol: "ETH", nativeReserveRaw: ETH_RESERVE, chain: robinhood,
    factory: "0xaad2c3c3012c4a71d09f47f9c7463b4b1eddb793",
    executor: "0x4739d39f51f9b1d9ff4ceb677da4082b51e66311",
    hook: "0x230f70f868d8e55c757984aead865018f92460cc",
  },
  {
    id: 57073, name: "Ink", nativeSymbol: "ETH", nativeReserveRaw: ETH_RESERVE, chain: ink,
    factory: "0x8b75a562eec5e85f8ec742ade9dd448ba9568011",
    executor: "0xe7c2299c936ad0ace926b60cb244416cca38aec8",
    hook: "0x81def7307ffa081be87e08fefa15f6dd99e8e0cc",
  },
];

export function getChain(id: number): KosmoChain {
  const c = CHAINS.find((x) => x.id === id);
  if (!c) throw new Error(`Unsupported chainId ${id}. Supported: ${CHAINS.map((x) => `${x.name} (${x.id})`).join(", ")}`);
  return c;
}

/** RPC: KOSMO_RPC_<chainId> if set, otherwise the chain's public default. Robinhood Chain has no built-in default. */
export function getClient(c: KosmoChain): PublicClient {
  const url = process.env[`KOSMO_RPC_${c.id}`] || c.chain.rpcUrls.default.http[0];
  if (!url) throw new Error(`No RPC for ${c.name}. Set the KOSMO_RPC_${c.id} environment variable to an RPC URL.`);
  return createPublicClient({ chain: c.chain, transport: http(url) }) as PublicClient;
}

export const BASE_URL: string = (process.env.KOSMO_BASE_URL || "https://kosmoprotocol.com").replace(/\/+$/, "");
