"use client";
import { useState } from "react";
import { explorer } from "@/config/network";
import type { TxResult } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";

type State = { s: "idle" } | { s: "pending" } | { s: "done"; r: TxResult };

/**
 * One wallet transaction: idle → "Confirm in your wallet" → success (explorer link) or the exact error.
 * `run` builds and sends the call; `onResult` receives the outcome (e.g. to refresh data).
 */
export function TxButton({
  label,
  run,
  onResult,
  disabled,
  disabledReason,
  variant = "primary",
}: {
  label: string;
  run: () => Promise<TxResult>;
  onResult?: (r: TxResult) => void;
  disabled?: boolean;
  disabledReason?: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { accountId, ready, signIn } = useWallet();
  const [st, setSt] = useState<State>({ s: "idle" });

  if (ready && !accountId) {
    return (
      <button onClick={signIn} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-sm font-medium text-fg-2 hover:border-fg hover:text-fg">
        Connect wallet to {label.charAt(0).toLowerCase() + label.slice(1)}
      </button>
    );
  }

  const cls =
    variant === "primary"
      ? "bg-green text-ink hover:brightness-110"
      : variant === "danger"
        ? "border border-bad/50 text-bad hover:bg-bad/10"
        : "border border-line-strong text-fg hover:border-fg";
  const busy = st.s === "pending";

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        disabled={disabled || busy || !ready}
        title={disabled ? disabledReason : undefined}
        onClick={async () => {
          setSt({ s: "pending" });
          const r = await run();
          setSt({ s: "done", r });
          onResult?.(r);
        }}
        className={`inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}
      >
        {busy ? "Confirm in your wallet…" : label}
      </button>
      {disabled && disabledReason && <p className="text-xs text-faint">{disabledReason}</p>}
      {st.s === "done" && st.r.ok && (
        <p className="text-xs text-green" role="status">
          Confirmed on chain.{" "}
          {st.r.txHash && (
            <a className="underline underline-offset-2" href={explorer.tx(st.r.txHash)} target="_blank" rel="noreferrer">
              View transaction ↗
            </a>
          )}
        </p>
      )}
      {st.s === "done" && !st.r.ok && (
        <p className="max-w-xl text-xs text-bad" role="alert">
          {st.r.error}
          {st.r.txHash && (
            <>
              {" "}
              <a className="underline underline-offset-2" href={explorer.tx(st.r.txHash)} target="_blank" rel="noreferrer">
                View transaction ↗
              </a>
            </>
          )}
        </p>
      )}
    </div>
  );
}
