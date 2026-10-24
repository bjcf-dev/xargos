// xARGOS is devnet-only: every explorer link carries ?cluster=devnet.
export function getExplorerUrl(path: string): string {
  const url = new URL(path, "https://explorer.solana.com");
  url.searchParams.set("cluster", "devnet");
  return url.toString();
}

export function ellipsify(str: string, chars = 4): string {
  if (str.length <= chars * 2 + 3) return str;
  return `${str.slice(0, chars)}...${str.slice(-chars)}`;
}
