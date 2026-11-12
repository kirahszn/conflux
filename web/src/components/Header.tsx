"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NetworkBadge } from "./NetworkBadge";
import { WalletButton } from "./WalletButton";

const NAV = [
  { href: "/agents", label: "Agents" },
  { href: "/tasks", label: "Tasks" },
];

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-[#021a15]/85 backdrop-blur-md">
      <div className="container-x flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex min-h-11 items-center gap-2.5" aria-label="Conflux home">
            <Mark />
            <span className="font-display text-base font-bold tracking-tight">Conflux</span>
            <NetworkBadge />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.href} {...n} active={path.startsWith(n.href)} />
            ))}
          </nav>
        </div>
        <div className="hidden md:block">
          <WalletButton />
        </div>
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full border border-line-strong md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            {open ? (
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>
      {open && (
        <div id="mobile-menu" className="border-t border-line md:hidden">
          <nav className="container-x flex flex-col gap-1 py-3" aria-label="Main">
            {NAV.map((n) => (
              <NavLink key={n.href} {...n} active={path.startsWith(n.href)} block />
            ))}
            <div className="pt-2">
              <WalletButton />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function NavLink({ href, label, active, block = false }: { href: string; label: string; active: boolean; block?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium transition ${block ? "w-full" : ""} ${
        active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg"
      }`}
    >
      {label}
    </Link>
  );
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#03140f" stroke="#2d6a5c" strokeWidth="2" />
      <path d="M14 18 C 26 18, 28 32, 32 32" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M14 46 C 26 46, 28 32, 32 32" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M10 32 H 32" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M32 32 H 52" fill="none" stroke="#00ec97" strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="32" cy="32" r="5.5" fill="#00ec97" />
    </svg>
  );
}
