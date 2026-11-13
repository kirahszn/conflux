// NEAR_NETWORK=testnet|mainnet (default testnet). Chooses the env file, the keychain folder, the
// default RPC, data folder and port, and the account suffix every id must have. It is read from
// the real environment only (never from an env file), because it decides which env file loads.
// Mainnet never falls back to testnet files or folders.
export type NearNetwork = "testnet" | "mainnet";

const raw = (process.env.NEAR_NETWORK ?? "testnet").trim();
if (raw !== "testnet" && raw !== "mainnet") throw new Error(`NEAR_NETWORK must be "testnet" or "mainnet", got "${raw}"`);
export const NETWORK: NearNetwork = raw;

export const NETWORK_DEFAULTS = {
  testnet: { rpcUrl: "https://test.rpc.fastnear.com", suffix: ".testnet", label: "NEAR testnet" },
  mainnet: { rpcUrl: "https://rpc.mainnet.fastnear.com", suffix: ".near", label: "NEAR mainnet" },
}[NETWORK];

/** Every account id must be a named account on this network (".testnet" or ".near"). */
export function assertAccountsOnNetwork(ids: Record<string, string>) {
  for (const [what, id] of Object.entries(ids)) {
    if (!id.endsWith(NETWORK_DEFAULTS.suffix)) {
      throw new Error(`${what} "${id}" is not a ${NETWORK} account (must end with ${NETWORK_DEFAULTS.suffix}). NEAR_NETWORK=${NETWORK}`);
    }
  }
}

/** Refuses to run when the RPC serves a different chain than NEAR_NETWORK. */
export async function assertRpcChain(rpcUrl: string) {
  let chainId: string | undefined;
  try {
    const r = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "status", method: "status", params: [] }),
      signal: AbortSignal.timeout(15_000),
    });
    chainId = ((await r.json()) as { result?: { chain_id?: string } }).result?.chain_id;
  } catch (e) {
    throw new Error(`Could not read chain_id from ${rpcUrl}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (chainId !== NETWORK) throw new Error(`RPC ${rpcUrl} serves chain "${chainId}", but NEAR_NETWORK=${NETWORK}. Refusing to start.`);
}
