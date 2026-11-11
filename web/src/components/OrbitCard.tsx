import type { OrbitCard as Card } from "@/lib/feed";
import { roleVars } from "@/lib/roles";
import { shortenAccount } from "./Account";
import { RoleTag, StatusPill } from "./Tags";

/** Shortens text to max chars at a word boundary (never clipped by CSS). */
export function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

const base = "light-scope glass block w-[212px] rounded-2xl p-4 text-left";
const label = "font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-faint";

/** One orbit card. Every value comes from the contract or the coordinator API. Long values are shortened, never cut off. */
export function OrbitCardView({ card, className = "", style, tabIndex }: { card: Card; className?: string; style?: React.CSSProperties; tabIndex?: number }) {
  const link = { href: card.href, target: "_blank", rel: "noreferrer", tabIndex } as const;
  switch (card.kind) {
    case "agent":
      return (
        <a {...link} style={{ ...roleVars(card.role), ...style }} className={`${base} ${className}`} aria-label={`Agent ${card.name}, owner ${card.owner}`}>
          <div className="flex items-center justify-between gap-2">
            <span className={label}>Agent</span>
            {card.role && <RoleTag role={card.role} />}
          </div>
          <p className="mt-2.5 font-display text-[14px] font-bold leading-tight">{shorten(card.name, 22)}</p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">Owner</p>
          <p className="whitespace-nowrap font-mono text-[11px] text-fg-2">{shortenAccount(card.owner, 25)}</p>
        </a>
      );
    case "task":
      return (
        <a {...link} style={style} className={`${base} ${className}`} aria-label={`Task ${card.id}: ${card.title}`}>
          <div className="flex items-center justify-between gap-2">
            <span className={label}>Task #{card.id}</span>
            <StatusPill status={card.status} />
          </div>
          <p className="mt-2.5 font-display text-[13px] font-bold leading-snug">{shorten(card.title, 30)}</p>
          <p className="mt-1.5 text-[12px] text-muted">
            {card.agents > 0 ? `${card.agents} agent${card.agents === 1 ? "" : "s"}` : `${card.slots} open role${card.slots === 1 ? "" : "s"}`}
          </p>
        </a>
      );
    case "payment":
      return (
        <a {...link} style={{ ...roleVars(card.role), ...style }} className={`${base} ${className}`} aria-label={`${card.amount} NEAR paid to ${card.to}`}>
          <div className="flex items-center justify-between gap-2">
            <span className={label}>Paid</span>
            <RoleTag role={card.role} />
          </div>
          <p className="mt-2.5 font-mono text-[17px] font-semibold text-green-ink">+{card.amount} NEAR →</p>
          <p className="mt-0.5 whitespace-nowrap font-mono text-[11px] text-fg-2">{shortenAccount(card.to, 25)}</p>
        </a>
      );
    case "proof":
      return (
        <a {...link} style={{ ...roleVars(card.role), ...style }} className={`${base} ${className}`} aria-label={`Proof for ${card.agentName}, signed in secure hardware by ${card.model}`}>
          <div className="flex items-center justify-between gap-2">
            <span className={label}>Proof</span>
            <RoleTag role={card.role} />
          </div>
          <p className="mt-2.5 text-[13px] font-semibold leading-snug">Signed in secure hardware</p>
          <p className="mt-0.5 whitespace-nowrap font-mono text-[10.5px] text-fg-2">{shorten(card.model, 26)}</p>
          <p className="mt-1 text-[11px] text-muted">
            {shorten(card.agentName, 22)}, task #{card.taskId}
          </p>
        </a>
      );
    case "disagree":
      return (
        <a {...link} style={style} className={`${base} ${className}`} aria-label={`Agents disagree on task ${card.taskId}: ${card.topic}`}>
          <span className={label}>Agents disagree · #{card.taskId}</span>
          <p className="mt-2 font-display text-[12px] font-bold leading-snug">{shorten(card.topic, 34)}</p>
          <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{shorten(card.text, 96)}</p>
        </a>
      );
  }
}
