import { explorer } from "@/lib/near";
import { roleColor, roleVars } from "@/lib/roles";
import type { Showcase } from "@/lib/showcase";
import { Account, shortenAccount } from "../Account";
import { RoleTag } from "../Tags";

const shortHex = (h: string, a = 6, b = 4) => (h.length > a + b + 1 ? `${h.slice(0, a)}…${h.slice(-b)}` : h);
const shortModel = (m: string) => m.split("/").pop() ?? m;
const iv = (i: number) => ({ "--i": i }) as React.CSSProperties;
const card = "rounded-3xl border border-line-strong/70 bg-surface shadow-[0_24px_48px_-24px_rgb(0_0_0/0.6)]";

// ---- 02 Plan -----------------------------------------------------------------
export function PlanVisual({ sc }: { sc: Showcase }) {
  const max = Math.max(...sc.plan.slots.map((s) => Number(s.reward_near)));
  return (
    <div className={`${card} p-6 sm:p-7`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-faint">Task #{sc.task.id} plan</p>
          <p className="mt-1 font-display text-lg font-bold">{sc.task.title}</p>
        </div>
        <p className="shrink-0 text-right font-mono">
          <span className="text-2xl font-semibold">{sc.task.budget_near}</span>
          <span className="ml-1 text-xs text-muted">NEAR</span>
        </p>
      </div>
      <ul className="mt-6 space-y-5">
        {sc.plan.slots.map((s, i) => (
          <li key={s.role} style={roleVars(s.role)}>
            <div className="flex items-center justify-between gap-3">
              <RoleTag role={s.role} />
              <span className="font-mono text-sm font-semibold">{s.reward_near} NEAR</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#021a15]">
              <div className="grow role-bar h-full origin-left rounded-full" style={{ width: `${(Number(s.reward_near) / max) * 100}%`, ...iv(i) }} />
            </div>
            <p className="mt-2 text-sm leading-snug text-muted">{s.reason}</p>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-xs text-muted">
        <span>
          Coordinator fee <span className="font-mono font-semibold text-fg">{sc.task.fee_near} NEAR</span>
        </span>
        <span className="font-mono">
          Plan signed: {sc.plan.proof.kind}, {shortModel(sc.plan.proof.model)}
        </span>
      </div>
    </div>
  );
}

// ---- 03 Agents -----------------------------------------------------------------
export function AgentsVisual({ sc }: { sc: Showcase }) {
  return (
    <ul className="space-y-4">
      {sc.contributions.map((c, i) => (
        <li key={c.agent_id} style={roleVars(c.role)} className="flex items-center gap-0">
          <div className="role-card w-[48%] min-w-0 shrink-0 rounded-2xl p-4">
            <RoleTag role={c.role} />
            <p className="mt-2 font-display text-[15px] font-bold">{c.name}</p>
            <p className="mt-0.5 whitespace-nowrap font-mono text-[11px] text-muted">{shortenAccount(c.agent_id, 19)}</p>
          </div>
          <div className="relative mx-1 h-[2px] min-w-6 flex-1" aria-hidden>
            <div className="grow absolute inset-0 origin-left" style={iv(i)}>
              <div className="wire wire-flow h-full" />
            </div>
            <span className="wire-dot absolute inset-0" style={iv(i)}>
              <span className="role-bar absolute -top-[3px] left-0 block h-2 w-2 -translate-x-1/2 rounded-full" />
            </span>
          </div>
          <div className="min-w-0 shrink-0 rounded-full border border-line-strong bg-surface px-3 py-2 text-xs">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Owner</span>
            <Account id={c.owner} max={22} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---- 04 Proof ------------------------------------------------------------------
export function ProofVisual({ sc }: { sc: Showcase }) {
  const c = sc.contributions.find((x) => x.proof) ?? null;
  if (!c?.proof) return null;
  const rows: [string, React.ReactNode][] = [
    ["Agent", <span key="a">{c.name}</span>],
    ["Model", <span key="m" className="font-mono">{shortModel(c.proof.model)}</span>],
    ["Proof kind", <span key="k" className="font-mono">{c.proof.kind}{c.proof.gather_kind ? ` (search: ${c.proof.gather_kind})` : ""}</span>],
    ["Signer", <span key="s" className="font-mono" title={c.proof.signing_address}>{shortHex(c.proof.signing_address)}</span>],
    ["Chat id", <span key="c" className="font-mono" title={c.proof.chat_id}>{shortHex(c.proof.chat_id, 13, 6)}</span>],
    ["result_hash", <span key="r" className="font-mono" title={c.result_hash ?? ""}>{c.result_hash ? shortHex(c.result_hash, 8, 6) : "none"}</span>],
  ];
  const col = roleColor(c.role);
  return (
    <div className="relative">
      <div className={`${card} overflow-hidden`} style={roleVars(c.role)}>
        <div className="role-bar h-1.5" aria-hidden />
        <div className="p-6 sm:p-7">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-faint">Contribution proof · slot {c.slot}</p>
            <RoleTag role={c.role} />
          </div>
          <dl className="mt-5 divide-y divide-line text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="min-w-0 text-right text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div
        className="stamp pointer-events-none absolute -top-5 right-2 grid h-24 w-24 place-items-center rounded-full border-[3px] border-green bg-[#021a15]/95 text-center font-display text-[11px] font-bold uppercase leading-tight tracking-wider text-green shadow-lg"
        aria-label="Signed in secure hardware"
        style={{ boxShadow: `0 10px 30px -10px ${col.solid}55` }}
      >
        <span>
          Signed
          <br />
          <span className="text-[9px] tracking-[0.2em]">in TEE</span>
        </span>
      </div>
    </div>
  );
}

// ---- 05 Synthesis --------------------------------------------------------------
export function SynthesisVisual({ sc }: { sc: Showcase }) {
  const roleOf = new Map(sc.contributions.map((c) => [c.name, c.role]));
  return (
    <div className="space-y-4">
      {sc.synthesis.disagreements.map((d, i) => (
        <div key={d.topic} className={`${card} rv p-5`} style={iv(i + 2)}>
          <p className="font-display text-sm font-bold">{d.topic}</p>
          <div className={`mt-3 grid gap-3 ${d.claims.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {d.claims.map((cl) => (
              <div key={cl.agent} style={roleVars(roleOf.get(cl.agent))} className="light-scope role-tag rounded-2xl p-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em]">{cl.agent}</p>
                <p className="mt-1 text-sm leading-snug text-fg">{cl.text}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- 06 Settlement -------------------------------------------------------------
export function SettlementVisual({ sc }: { sc: Showcase }) {
  return (
    <div className={`${card} p-5 sm:p-7`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-5">
        <a
          href={explorer.account(sc.contract_id)}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 shrink-0 flex-wrap items-baseline gap-x-3 rounded-2xl border border-green/40 bg-[#021a15] p-4 text-fg transition hover:border-green sm:w-36 sm:flex-col sm:flex-nowrap sm:justify-center"
          aria-label={`Contract ${sc.contract_id}. Open in explorer`}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Escrow</span>
          <span className="font-mono text-2xl font-semibold text-green sm:mt-1">{sc.task.budget_near}</span>
          <span className="text-xs text-muted">NEAR</span>
          <span className="font-mono text-[10px] text-muted sm:mt-3">{shortenAccount(sc.contract_id, 16)}</span>
        </a>
        <ul className="flex min-w-0 flex-1 flex-col justify-between gap-3">
          {sc.payouts.map((p, i) => (
            <li key={p.to} className="flex items-center gap-2 sm:gap-3" style={roleVars(p.role)}>
              <div className="relative h-7 min-w-8 flex-1 overflow-hidden" aria-hidden>
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line-strong" />
                <div className="coin-run absolute inset-0 flex items-center justify-end" style={iv(i)}>
                  <span className="rounded-full bg-green px-2 py-0.5 font-mono text-[10px] font-bold text-ink">+{p.amount_near}</span>
                </div>
              </div>
              <a
                href={explorer.account(p.to)}
                target="_blank"
                rel="noreferrer"
                className="arrive flex min-h-11 w-[66%] min-w-0 shrink-0 flex-col justify-center rounded-xl border border-line-strong bg-surface-2 px-3 py-2 transition hover:border-green sm:w-[58%]"
                style={iv(i)}
                aria-label={`${p.amount_near} NEAR to ${p.to}. Open in explorer`}
              >
                <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-xs font-semibold">{p.label}</span>
                  <span className="shrink-0 font-mono text-sm font-semibold text-green">+{p.amount_near}</span>
                </span>
                <span className="block whitespace-nowrap font-mono text-[11px] text-muted">{shortenAccount(p.to, 16)}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
