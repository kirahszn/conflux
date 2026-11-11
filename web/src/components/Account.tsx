import { explorer } from "@/lib/near";

/** "agent.research-blessing.testnet" → "agent.resea…ng.testnet"; implicit hex ids → "a1b2c3…d4e5f6". */
export function shortenAccount(id: string, max = 22): string {
  if (id.length <= max) return id;
  if (/^[0-9a-f]{64}$/.test(id)) return `${id.slice(0, 6)}…${id.slice(-6)}`;
  const tail = id.endsWith(".testnet") ? 10 : 8;
  return `${id.slice(0, max - tail - 1)}…${id.slice(-tail)}`;
}

/** Shortened account id. Full value on hover. Links to the testnet explorer. */
export function Account({ id, max, className = "" }: { id: string; max?: number; className?: string }) {
  return (
    <a
      href={explorer.account(id)}
      target="_blank"
      rel="noreferrer"
      aria-label={`${id}. Open in the NEAR testnet explorer`}
      className={`group relative inline-flex max-w-full items-center font-mono text-[0.82em] text-fg-2 underline decoration-line-strong underline-offset-4 transition hover:text-green-ink hover:decoration-green ${className}`}
    >
      <span className="truncate">{shortenAccount(id, max)}</span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-40 mb-2 hidden whitespace-nowrap rounded-md bg-fg px-2 py-1 text-xs text-white shadow-lg group-hover:block group-focus-visible:block"
      >
        {id}
      </span>
    </a>
  );
}
