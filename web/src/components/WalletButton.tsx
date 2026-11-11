"use client";
import { useWallet } from "@/lib/wallet";
import { Account } from "./Account";

export function WalletButton() {
  const { ready, accountId, busy, error, signIn, signOut } = useWallet();

  if (!ready) {
    return <span className="skeleton h-9 w-36" aria-label="Loading wallet" />;
  }
  if (accountId) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-2 rounded-md border border-line px-3 py-1.5 sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
          <Account id={accountId} />
        </span>
        <button
          onClick={signOut}
          disabled={busy}
          className="rounded-md border border-line-strong px-3 py-1.5 text-sm text-muted transition hover:border-paper hover:text-paper disabled:opacity-50"
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
        className="rounded-md bg-signal px-4 py-1.5 text-sm font-semibold text-ink transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "Connecting…" : "Connect wallet"}
      </button>
    </div>
  );
}
