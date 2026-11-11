"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";

const NAV = [
  { href: "/agents", label: "Agents" },
  { href: "/tasks", label: "Tasks" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Conflux home">
            <Mark />
            <span className="font-display text-base font-bold tracking-tight">Conflux</span>
            <span className="hidden rounded-full bg-green-soft px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-green-ink sm:inline">
              testnet
            </span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            {NAV.map((n) => {
              const active = path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${active ? "bg-fg text-white" : "text-muted hover:bg-surface hover:text-fg"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <WalletButton />
      </div>
    </header>
  );
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--color-fg)" />
      <path d="M14 18 C 26 18, 28 32, 32 32" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M14 46 C 26 46, 28 32, 32 32" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M10 32 H 32" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M32 32 H 52" fill="none" stroke="var(--color-green)" strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="32" cy="32" r="5.5" fill="var(--color-green)" />
    </svg>
  );
}
