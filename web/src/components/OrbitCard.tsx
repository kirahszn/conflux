import type { OrbitCard as Card } from "@/lib/feed";
import { roleVars } from "@/lib/roles";
import { shortenAccount } from "./Account";
import { RoleTag, StatusPill } from "./Tags";

const base = "block w-[228px] rounded-2xl p-4 text-left";
const label = "font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-faint";

/** One card in the orbit. Every value comes from the contract or the coordinator API. */
export function OrbitCardView({ card, className = "", style, tabIndex }: { card: Card; className?: string; style?: React.CSSProperties; tabIndex?: number }) {
  const link = { href: card.href, target: "_blank", rel: "noreferrer", tabIndex } as const;
  switch (card.kind) {
    case "agent":
      return (
        <a {...link} style={{ ...roleVars(card.role), ...style }} className={`role-card ${base} ${className}`} aria-label={`Agent ${card.name}`}>
          <div className="flex items-center justify-between">
            <span className={label}>Agent</span>
            {card.role && <RoleTag role={card.role} />}
          </div>
          <p className="mt-2.5 font-display text-[15px] font-bold leading-tight">{card.name}</p>
          <p className="mt-1.5 truncate font-mono text-[11px] text-muted">owner {shortenAccount(card.owner, 26)}</p>
        </a>
      );
    case "task":
      return (
        <a {...link} style={{ ...roleVars(null), ...style }} className={`role-card ${base} ${className}`} aria-label={`Task ${card.id}: ${card.title}`}>
          <div className="flex items-center justify-between">
            <span className={label}>Task #{card.id}</span>
            <StatusPill status={card.status} />
          </div>
          <p className="mt-2.5 line-clamp-2 font-display text-[14px] font-bold leading-snug">{card.title}</p>
          <p className="mt-1.5 text-[12px] text-muted">
            {card.agents > 0 ? `${card.agents} agent${card.agents === 1 ? "" : "s"}` : `${card.slots} open role${card.slots === 1 ? "" : "s"}`}
          </p>
        </a>
      );
    case "payment":
      return (
        <a {...link} style={{ ...roleVars(card.role), ...style }} className={`role-card ${base} ${className}`} aria-label={`${card.amount} NEAR paid to ${card.to}`}>
          <div className="flex items-center justify-between">
            <span className={label}>Paid</span>
            <RoleTag role={card.role} />
          </div>
          <p className="mt-2.5 font-mono text-[13px] leading-snug">
            <span className="text-[17px] font-semibold text-green-ink">+{card.amount} NEAR</span>
            <span className="text-muted"> → </span>
            <span className="break-all text-fg-2">{card.to}</span>
          </p>
        </a>
      );
    case "proof":
      return (
        <a {...link} style={{ ...roleVars(card.role), ...style }} className={`role-card ${base} ${className}`} aria-label={`Proof for ${card.agentName}`}>
          <div className="flex items-center justify-between">
            <span className={label}>Proof</span>
            <RoleTag role={card.role} />
          </div>
          <p className="mt-2.5 text-[13px] font-semibold leading-snug">
            <span aria-hidden className="mr-1">🔒</span>Signed in secure hardware · <span className="font-mono text-[12px] font-medium">{card.model}</span>
          </p>
          <p className="mt-1.5 text-[11px] text-muted">
            {card.agentName}, task #{card.taskId}
          </p>
        </a>
      );
    case "disagree":
      return (
        <a {...link} style={style} className={`block w-[260px] rounded-2xl bg-fg p-4 text-left text-white shadow-xl ${className}`} aria-label="Agents disagree">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-green">Agents disagree · task #{card.taskId}</span>
          <p className="mt-2 font-display text-[13px] font-bold leading-snug">{card.topic}</p>
          <p className="mt-1.5 text-[12px] leading-snug text-white/75">{card.text}</p>
        </a>
      );
  }
}
