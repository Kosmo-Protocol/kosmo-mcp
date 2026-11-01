// Exact message formats used by Kosmo Protocol (src/lib/agentMessage.ts and the agent docs).
export function metadataMessage(token: string, timestamp: number): string {
  return `Update Kosmo Protocol metadata for ${token.toLowerCase()}\nTimestamp: ${timestamp}`;
}
export function badgeMessage(wallet: string, xHandle: string): string {
  return `Kosmo Protocol agent verification: ${wallet.toLowerCase()} is operated by @${xHandle.replace(/^@/, "").toLowerCase()}`;
}
