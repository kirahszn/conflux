// The ONLY place network-specific values live. Switching testnet → mainnet is config only:
//   NEXT_PUBLIC_NETWORK=mainnet   (and NEXT_PUBLIC_CONTRACT_ID / NEXT_PUBLIC_COORDINATOR_URL once they exist)
// Every other file reads `network` from here. Values are public (sent to the browser).
// No runtime imports, so Node scripts (scripts/*.mts) can import this file too.

export type NetworkId = "testnet" | "mainnet";

export interface NetworkConfig {
  networkId: NetworkId;
  /** Shown in the network badge and copy, e.g. "Testnet". */
  label: string;
  /** Conflux contract. null = not deployed on this network yet; the site shows a "not configured" screen. */
  contractId: string | null;
  /** JSON-RPC endpoint for contract views and the wallet connector. */
  rpcUrl: string;
  /** Block explorer base URL (NearBlocks paths: /address/<id>, /txns/<hash>). */
  explorerUrl: string;
  /** Coordinator API. null = no coordinator for this network; coordinator views show "offline". */
  coordinatorUrl: string | null;
  /** Account suffix on this network, used to shorten ids ("agent.research…ng.testnet"). */
  accountSuffix: string;
  /** Real example task for the "What is Conflux" page (snapshot in src/data/task3.json). Testnet only. */
  showcase: { taskId: number; approveTx: string } | null;
}

const NETWORKS: Record<NetworkId, NetworkConfig> = {
  testnet: {
    networkId: "testnet",
    label: "Testnet",
    contractId: "v2.conflux-blessing.testnet",
    rpcUrl: "https://test.rpc.fastnear.com",
    explorerUrl: "https://testnet.nearblocks.io",
    coordinatorUrl: "http://localhost:8787",
    accountSuffix: ".testnet",
    // Task 3 "Analyze NEAR Intents": settled end to end; this is its approve_task transaction.
    showcase: { taskId: 3, approveTx: "8XcdHdLrCvmFkKVa5ERV7BWJcvv4cKGhnyT7HkpuzdZ9" },
  },
  mainnet: {
    networkId: "mainnet",
    label: "Mainnet",
    contractId: null, // set when the mainnet contract is deployed (or via NEXT_PUBLIC_CONTRACT_ID)
    rpcUrl: "https://rpc.mainnet.fastnear.com",
    explorerUrl: "https://nearblocks.io",
    coordinatorUrl: null, // set when the mainnet coordinator is deployed (or via NEXT_PUBLIC_COORDINATOR_URL)
    accountSuffix: ".near",
    showcase: null,
  },
};

function select(): NetworkConfig {
  const id = (process.env.NEXT_PUBLIC_NETWORK ?? "testnet").trim();
  if (id !== "testnet" && id !== "mainnet") {
    throw new Error(`NEXT_PUBLIC_NETWORK must be "testnet" or "mainnet", got "${id}"`);
  }
  const base = NETWORKS[id];
  // Per-deployment overrides (Vercel / .env.local). Empty strings are ignored.
  const env = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  return {
    ...base,
    contractId: env(process.env.NEXT_PUBLIC_CONTRACT_ID) ?? base.contractId,
    rpcUrl: env(process.env.NEXT_PUBLIC_NEAR_RPC_URL) ?? base.rpcUrl,
    coordinatorUrl: (env(process.env.NEXT_PUBLIC_COORDINATOR_URL) ?? base.coordinatorUrl)?.replace(/\/$/, "") ?? null,
  };
}

export const network: NetworkConfig = select();

export const explorer = {
  account: (id: string) => `${network.explorerUrl}/address/${id}`,
  tx: (hash: string) => `${network.explorerUrl}/txns/${hash}`,
};
