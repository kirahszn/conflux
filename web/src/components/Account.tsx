import { explorer } from "@/lib/near";

/** "agent.research-blessing.testnet" → "agent.resea…ng.testnet"; implicit hex ids → "a1b2c3…d4e5f6". */
export function shortenAccount(id: string, max = 22): string {
  if (id.length <= max) return id;
  if (/^[0-9a-f]{64}$/.test(id)) return `${id.slice(0, 6)}…${id.slice(-6)}`;
  const tail = id.endsWith(".testnet") ? 10 : 8;
  return `${id.slice(0, max - tail - 1)}…${id.slice(-tail)}`;
}

/** Shortened account id; full value on hover; links to the testnet explorer. */
export function Account({ id, className = "" }: { id: string; className?: string }) {
  return (
    <a
      href={explorer.account(id)}
      target="_blank"
      rel="noreferrer"
      title={`${id} — open in NEAR testnet explorer`}
      className={`group relative inline-flex max-w-full items-center font-mono text-[0.82em] text-paper/90 underline decoration-line-strong underline-offset-4 transition hover:text-signal hover:decoration-signal ${className}`}
    >
      <span className="truncate">{shortenAccount(id)}</span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden whitespace-nowrap rounded border border-line-strong bg-ink-3 px-2 py-1 text-xs text-paper shadow-lg group-hover:block group-focus-visible:block"
      >
        {id}
      </span>
    </a>
  );
}
