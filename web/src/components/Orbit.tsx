"use client";
import { useMemo } from "react";
import { useCoordinatorExtras } from "@/lib/coordinator";
import { orbitCards, type OrbitCard } from "@/lib/feed";
import { useChainData } from "@/lib/useChainData";
import { OrbitCardView } from "./OrbitCard";

const TILTS = [-5, 3, -2, 6, -4, 2, -6, 4];

/**
 * Hero with a rotating ring of real cards around the headline (CSS 3D transforms, no library).
 * Laptop/desktop with motion: 3D ring. Mobile: one scrolling row below the headline.
 * prefers-reduced-motion: a static, wrapped grid below the headline.
 * While loading, on error, or with no data, the headline stands on its own.
 */
export function OrbitHero({ children }: { children: React.ReactNode }) {
  const { data } = useChainData();
  const ready = data.state === "ready";
  const extras = useCoordinatorExtras(ready ? data.tasks : null, ready ? data.agents : null);

  const cards = useMemo(() => {
    if (!ready) return [];
    const ok = extras.state === "done" && extras.reachable;
    return orbitCards(data.agents, data.tasks, ok ? extras.proofs : [], ok ? extras.disagreement : null);
  }, [data, ready, extras]);

  return (
    <section className="relative overflow-hidden">
      {cards.length > 0 && <Ring cards={cards} />}
      <div className="hero-pad pointer-events-none relative z-10 px-4">
        <div className="hero-halo pointer-events-none absolute inset-x-0 top-1/2 mx-auto hidden h-[560px] max-w-4xl -translate-y-1/2 md:block" aria-hidden />
        <div className="relative">{children}</div>
      </div>
      {cards.length > 0 && <Flat cards={cards.slice(0, 10)} />}
    </section>
  );
}

function Ring({ cards }: { cards: OrbitCard[] }) {
  const step = 360 / cards.length;
  return (
    <div className="orbit-3d" role="region" aria-label="Live cards from the Conflux contract">
      <div className="orbit-tilt">
        <div className="orbit-spin">
          {cards.map((c, i) => (
            <div key={c.key} className="orbit-slot" style={{ "--a": `${i * step}deg` } as React.CSSProperties}>
              <div className="orbit-face">
                <OrbitCardView card={c} className="orbit-card" style={{ "--tilt": `${TILTS[i % TILTS.length]}deg` } as React.CSSProperties} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Flat({ cards }: { cards: OrbitCard[] }) {
  return (
    <div className="orbit-flat marquee marquee-wrap pb-6" style={{ "--marquee-dur": "60s" } as React.CSSProperties}>
      <div className="marquee-track px-2 py-3">
        {cards.map((c) => (
          <div key={c.key} className="shrink-0 px-2 py-2">
            <OrbitCardView card={c} />
          </div>
        ))}
        {cards.map((c) => (
          <div key={`dup-${c.key}`} className="marquee-dup shrink-0 px-2 py-2" aria-hidden>
            <OrbitCardView card={c} tabIndex={-1} />
          </div>
        ))}
      </div>
    </div>
  );
}
