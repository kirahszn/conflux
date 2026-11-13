"use client";
// "Signature verified" only when every check in lib/verify.ts passed. Red names the first failed
// check. Grey means it could not be checked (coordinator offline, still loading): never green.
import type { Verification } from "@/lib/verify";

export const ATTESTATION_DOCS = "https://docs.near.ai/cloud/verification";
export const VERIFICATION_CENTER = "https://cloud.near.ai/verify";

export type VerifyState = { state: "checking" } | { state: "unavailable"; reason: string } | { state: "done"; v: Verification };

const KIND: Record<string, string> = {
  provider_tee: "signed by the model provider's key, which NEAR AI attests runs inside a TEE",
  gateway: "signed by the NEAR AI gateway's key",
};

export function VerifyBadge({ s, compact = false }: { s: VerifyState; compact?: boolean }) {
  const pill = (cls: string, text: string, title?: string) => (
    <span title={title} className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      <span className="truncate">{text}</span>
    </span>
  );
  if (s.state === "checking") return pill("bg-surface-2 text-muted", "Checking signature…");
  if (s.state === "unavailable") return pill("bg-surface-2 text-muted", compact ? "Not checked" : `Not checked: ${s.reason}`, s.reason);
  const { v } = s;
  if (v.unavailable) return pill("bg-surface-2 text-muted", compact ? "Not checked" : `Not checked: ${v.unavailable}`, v.unavailable);
  const badge = v.ok
    ? pill("bg-green-soft text-green", "✓ Signature verified", `${v.checks.length} checks passed`)
    : pill("bg-bad/15 text-bad", `✗ Verification failed: ${v.failed?.label ?? "unknown check"}`, v.failed?.detail);
  if (compact) return badge;
  return (
    <details className="group rounded-lg border border-line bg-bg/40">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-1.5 text-xs text-muted">
        {badge}
        <span className="group-open:hidden">Show the {v.checks.length} checks</span>
        <span className="hidden group-open:inline">Hide the checks</span>
      </summary>
      <div className="border-t border-line px-3 pb-3 pt-2 text-xs">
        <p className="text-faint">Checked in your browser from the raw signed bytes and the chain. The coordinator is not trusted.</p>
        <ul className="mt-2 space-y-1.5">
          {v.checks.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className={c.ok ? "text-green" : "text-bad"} aria-label={c.ok ? "passed" : "failed"}>{c.ok ? "✓" : "✗"}</span>
              <span className="min-w-0">
                <span className="text-fg-2">{c.label}</span>
                <span className="block break-all font-mono text-[11px] text-faint">{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        {v.signers.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-line pt-2">
            {v.signers.map((sg) => (
              <li key={sg.step} className="text-fg-2">
                <span className="text-faint">{sg.step}:</span> <span className="break-all font-mono text-[11px]">{sg.address}</span>, {KIND[sg.kind] ?? sg.kind}.
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-faint">
          This proves which key signed these exact bytes. That the key lives in a TEE is NEAR AI&apos;s hardware attestation, checked separately:{" "}
          <a href={ATTESTATION_DOCS} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-fg-2 underline underline-offset-2 hover:text-green">
            NEAR AI verification docs
          </a>{" "}
          or the{" "}
          <a href={VERIFICATION_CENTER} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-fg-2 underline underline-offset-2 hover:text-green">
            Verification Center
          </a>
          .
        </p>
      </div>
    </details>
  );
}

/** Badge state from a coordinator view state and one verification. */
export function verifyState(coord: { state: string; reason?: string; message?: string }, v: Verification | null | undefined): VerifyState {
  if (coord.state === "offline") return { state: "unavailable", reason: "coordinator offline, proofs unavailable" };
  if (coord.state === "error") return { state: "unavailable", reason: coord.message ?? "could not load the proofs" };
  if (coord.state !== "ready") return { state: "checking" };
  if (!v) return { state: "unavailable", reason: "nothing submitted" };
  return { state: "done", v };
}
