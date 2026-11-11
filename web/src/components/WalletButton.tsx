"use client";
import { useWallet } from "@/lib/wallet";
import { shortenAccount } from "./Account";

export function WalletButton() {
  const { ready, accountId, busy, error, signIn, signOut } = useWallet();

  if (!ready) {
    return <span className="skeleton block h-11 w-36 !rounded-full" aria-label="Loading wallet" />;
  }
  if (accountId) {
    return (
      <div className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line-strong bg-surface p-1 pl-3">
        <span className="h-2 w-2 rounded-full bg-green" aria-hidden />
        <span className="px-1 font-mono text-xs text-fg-2" title={accountId}>
          {shortenAccount(accountId, 20)}
        </span>
        <button
          onClick={signOut}
          disabled={busy}
          className="inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-50"
        >
          {busy ? "…" : "Disconnect"}
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      {error && (
        <span className="hidden max-w-48 truncate text-xs text-bad md:inline" title={error}>
          {error}
        </span>
      )}
      <button
        onClick={signIn}
        disabled={busy}
        className="inline-flex min-h-11 items-center rounded-full bg-fg px-5 text-sm font-semibold text-ink transition hover:bg-fg-2 disabled:opacity-60"
      >
        {busy ? "Connecting…" : "Connect wallet"}
      </button>
    </div>
  );
}
