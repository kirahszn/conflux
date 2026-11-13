"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { explorer, network } from "@/config/network";
import { Mark } from "../Mark";
import { NetworkBadge } from "../NetworkBadge";
import { IconAgents, IconContributions, IconInfo, IconOverview, IconSettlements, IconTasks } from "./Icons";

export const NAV = [
  { href: "/overview", label: "Overview", icon: IconOverview },
  { href: "/agents", label: "Agent Network", icon: IconAgents },
  { href: "/tasks", label: "Tasks", icon: IconTasks },
  { href: "/contributions", label: "Contributions", icon: IconContributions },
  { href: "/settlements", label: "Settlements", icon: IconSettlements },
];
const ABOUT = { href: "/", label: "About Conflux", icon: IconInfo };

export const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

/** Navigation used by the desktop sidebar and the mobile drawer. */
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const item = (n: (typeof NAV)[number]) => {
    const active = isActive(path, n.href);
    const Icon = n.icon;
    return (
      <Link
        key={n.href}
        href={n.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`group relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
          active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg"
        }`}
      >
        {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-green" aria-hidden />}
        <span className={active ? "text-green" : "text-faint group-hover:text-fg-2"}>
          <Icon />
        </span>
        {n.label}
      </Link>
    );
  };
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(item)}
      <div className="my-3 border-t border-line" />
      {item(ABOUT)}
    </nav>
  );
}

export function Brand() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2.5" aria-label="Conflux home">
      <Mark size={26} />
      <span className="font-display text-[15px] font-bold tracking-tight">Conflux</span>
      <NetworkBadge />
    </Link>
  );
}

/** Desktop sidebar (lg and up). */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-[#0c0f0e]/80 px-3 py-4 lg:flex">
      <div className="px-2">
        <Brand />
      </div>
      <div className="mt-6 flex-1">
        <NavList />
      </div>
      {network.contractId && (
        <a
          href={explorer.account(network.contractId)}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 flex-col justify-center rounded-lg px-3 text-[11px] text-faint hover:bg-surface hover:text-fg-2"
          title={network.contractId}
        >
          <span className="font-semibold uppercase tracking-[0.14em]">Contract</span>
          <span className="truncate font-mono text-fg-2">{network.contractId}</span>
        </a>
      )}
    </aside>
  );
}
