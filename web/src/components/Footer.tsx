"use client";
import { useEffect, useState } from "react";
import { CONTRACT_ID, COORDINATOR_URL, explorer } from "@/lib/near";
import { Mark } from "./Header";

export const GITHUB_URL = "https://github.com/kirahszn/conflux";
type Health = "checking" | "online" | "offline";

export function Footer() {
  const [health, setHealth] = useState<Health>("checking");
  useEffect(() => {
    let alive = true;
    const check = () =>
      fetch(`${COORDINATOR_URL}/health`, { signal: AbortSignal.timeout(5000) })
        .then((r) => alive && setHealth(r.ok ? "online" : "offline"))
        .catch(() => alive && setHealth("offline"));
    check();
    const t = setInterval(check, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const link = "inline-flex min-h-11 items-center font-medium text-fg underline decoration-line-strong underline-offset-4 transition hover:decoration-green";
  return (
    <footer className="mt-24 border-t border-line bg-[#021a15]/60">
      <div className="container-x flex flex-col gap-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2.5">
          <Mark size={22} />
          Conflux, made for the NEAR Hackathon.
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a className={link} href={explorer.account(CONTRACT_ID)} target="_blank" rel="noreferrer" title={CONTRACT_ID}>
            Contract ↗
          </a>
          <a className={link} href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
          <span className="flex items-center gap-2 text-xs" title={COORDINATOR_URL}>
            <span className={`h-2 w-2 rounded-full ${health === "online" ? "bg-green" : health === "offline" ? "bg-bad" : "bg-line-strong"}`} aria-hidden />
            Coordinator {health === "checking" ? "checking" : health === "online" ? "online" : "offline"}
          </span>
        </div>
      </div>
    </footer>
  );
}
