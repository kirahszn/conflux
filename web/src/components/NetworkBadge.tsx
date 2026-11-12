import { network } from "@/config/network";

/** Network badge. Reads the single network config; mainnet gets a stronger style so it is never mistaken for testnet. */
export function NetworkBadge() {
  const main = network.networkId === "mainnet";
  return (
    <span
      title={`NEAR ${network.label}${network.contractId ? `, contract ${network.contractId}` : ""}`}
      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
        main ? "bg-green text-ink" : "bg-green-soft text-green"
      }`}
    >
      {network.label}
    </span>
  );
}
