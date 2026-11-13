"use client";
import Link from "next/link";
import { NetworkGraphLive } from "../graph/LiveGraphs";

/** Read-only preview of the real network graph. */
export function NetworkPreview() {
  return (
    <>
      <NetworkGraphLive readOnly />
      <Link href="/agents" className="mt-2 inline-flex min-h-11 items-center text-sm text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-green">
        Explore it in the Agent Network →
      </Link>
    </>
  );
}
