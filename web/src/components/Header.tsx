"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/agents", label: "Agents" },
];

export function Header() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Conflux home">
            <Mark />
            <span className="font-display text-lg font-semibold tracking-tight">Conflux</span>
            <span className="hidden rounded border border-signal/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-signal sm:inline">
              testnet
            </span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Main">
            {NAV.map((n) => {
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${active ? "bg-ink-3 text-paper" : "text-muted hover:text-paper"}`}
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

export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M8 16 C 24 16, 26 32, 32 32" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M8 48 C 24 48, 26 32, 32 32" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M4 32 H 32" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M32 32 H 58" fill="none" stroke="var(--color-signal)" strokeWidth="7" strokeLinecap="round" />
      <circle cx="32" cy="32" r="5.5" fill="var(--color-signal)" />
    </svg>
  );
}
