"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Footer } from "../Footer";
import { WalletButton } from "../WalletButton";
import { CoordinatorStatus } from "./CoordinatorStatus";
import { IconMenu } from "./Icons";
import { OfflineBanner } from "./OfflineBanner";
import { Brand, NavList } from "./Sidebar";
import { Sidebar } from "./Sidebar";

const LANDING_NAV = [
  { href: "#how", label: "How it works" },
  { href: "#network", label: "Network" },
  { href: "#split", label: "Fair split" },
  { href: "#why", label: "Why NEAR" },
];

/** Dashboard layout: left sidebar on desktop, top bar with a drawer menu below 1024px. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The landing page has its own slim header and no sidebar.
  if (path === "/") {
    return (
      <div className="landing-bg flex min-h-dvh flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-bg/55 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <Brand />
            <nav aria-label="Page sections" className="hidden items-center gap-1 md:flex">
              {LANDING_NAV.map((n) => (
                <a key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm text-fg-2 transition-colors hover:bg-white/5 hover:text-green">
                  {n.label}
                </a>
              ))}
              <Link href="/overview" className="rounded-md px-3 py-2 text-sm text-fg-2 transition-colors hover:bg-white/5 hover:text-green">
                Overview
              </Link>
            </nav>
            <Link href="/overview" className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-4 text-sm font-medium text-fg hover:border-green hover:text-green">
              Open app
            </Link>
          </div>
          <OfflineBanner />
        </header>
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <Brand />
            </div>
            <div className="hidden lg:block">
              <CoordinatorStatus />
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:block">
                <WalletButton />
              </div>
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-lg border border-line-strong text-fg-2 lg:hidden"
                aria-expanded={open}
                aria-controls="nav-drawer"
                aria-label={open ? "Close menu" : "Open menu"}
                onClick={() => setOpen((o) => !o)}
              >
                <IconMenu open={open} />
              </button>
            </div>
          </div>
          <OfflineBanner />
        </header>

        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <button className="absolute inset-0 bg-black/60" aria-label="Close menu" onClick={() => setOpen(false)} />
            <div id="nav-drawer" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-r border-line bg-[#0c0f0e] p-4">
              <div className="flex items-center justify-between">
                <Brand />
                <button
                  type="button"
                  className="grid h-11 w-11 place-items-center rounded-lg border border-line-strong text-fg-2"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                >
                  <IconMenu open />
                </button>
              </div>
              <NavList onNavigate={() => setOpen(false)} />
              <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
                <CoordinatorStatus />
                <WalletButton />
              </div>
            </div>
          </div>
        )}

        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
