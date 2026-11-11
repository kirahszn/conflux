"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCoordinatorExtras } from "@/lib/coordinator";
import { orbitCards, type OrbitCard } from "@/lib/feed";
import { useChainData } from "@/lib/useChainData";
import { OrbitCardView } from "./OrbitCard";

const MAX_CARDS = 10;
const GAP = 28; // min px between a card and the text block
const EDGE = 16; // min px between a card and the hero edge
const RING_MIN_WIDTH = 1024;

type Geo = { mode: "ring"; rx: number; ry: number; height: number } | { mode: "row" };

/**
 * Hero: text block in a clear zone, real cards orbiting it on an ellipse.
 * The ellipse is sized from measured text and card sizes so that the corner of the text block
 * (grown by half a card plus GAP) lies inside it, which means no card can ever touch the text.
 * If the ellipse does not fit the width (phones, tablets), the cards become one scrolling row.
 */
export function OrbitHero({ children }: { children: React.ReactNode }) {
  const { data } = useChainData();
  const ready = data.state === "ready";
  const extras = useCoordinatorExtras(ready ? data.tasks : null, ready ? data.agents : null);
  const cards = useMemo(() => {
    if (!ready) return [];
    const ok = extras.state === "done" && extras.reachable;
    return orbitCards(data.agents, data.tasks, ok ? extras.proofs : [], ok ? extras.disagreement : null, MAX_CARDS);
  }, [data, ready, extras]);

  const cardKey = cards.map((c) => c.key).join(",");
  const heroRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);

  useLayoutEffect(() => {
    const hero = heroRef.current;
    const text = textRef.current;
    const ring = ringRef.current;
    if (!hero || !text || !ring || cards.length === 0) return;
    const measure = () => {
      const W = hero.clientWidth;
      const els = [...ring.querySelectorAll<HTMLElement>(".orbit-card")];
      const cw = Math.max(...els.map((e) => e.offsetWidth));
      const ch = Math.max(...els.map((e) => e.offsetHeight));
      const a = text.offsetWidth / 2 + cw / 2 + GAP;
      const b = text.offsetHeight / 2 + ch / 2 + GAP;
      const rx = Math.min(W / 2 - cw / 2 - EDGE, 620);
      if (W < RING_MIN_WIDTH || rx < a * 1.1) return setGeo({ mode: "row" });
      // corner (a, b) inside the ellipse: a²/rx² + b²/ry² <= 1, with a 6% margin
      const ry = (b / Math.sqrt(1 - (a / rx) ** 2)) * 1.06;
      setGeo({ mode: "ring", rx, ry, height: Math.ceil(2 * (ry + ch / 2) + 2 * EDGE) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(hero);
    ro.observe(text);
    return () => ro.disconnect();
  }, [cardKey]);

  const ring = geo?.mode === "ring" ? geo : null;
  return (
    <section ref={heroRef} className="relative overflow-hidden" style={ring ? { minHeight: ring.height } : undefined}>
      <Beams />
      <div
        className={`z-10 flex flex-col items-center px-4 ${ring ? "absolute inset-0 justify-center" : "relative pt-14 pb-8 sm:pt-20"}`}
      >
        <div ref={textRef} className="hero-text relative w-full max-w-[36rem]">
          {children}
        </div>
      </div>

      {cards.length > 0 && (
        <div
          ref={ringRef}
          className="orbit-ring"
          aria-hidden={ring ? undefined : true}
          role={ring ? "region" : undefined}
          aria-label={ring ? "Live cards from the Conflux contract" : undefined}
          style={
            {
              "--rx": `${ring?.rx ?? 0}px`,
              "--k": ring ? ring.ry / ring.rx : 1,
              "--inv-k": ring ? ring.rx / ring.ry : 1,
              visibility: ring ? "visible" : "hidden",
            } as React.CSSProperties
          }
        >
          <div className="orbit-spin">
            {cards.map((c, i) => (
              <div key={c.key} className="orbit-slot" style={{ "--a": `${(i * 360) / cards.length}deg` } as React.CSSProperties}>
                <div className="orbit-face">
                  <OrbitCardView card={c} className="orbit-card" tabIndex={ring ? undefined : -1} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {cards.length > 0 && geo?.mode === "row" && <CardRow cards={cards} />}
    </section>
  );
}

function CardRow({ cards }: { cards: OrbitCard[] }) {
  return (
    <div className="marquee relative z-10 w-full pb-10" role="region" aria-label="Live cards from the Conflux contract" style={{ "--marquee-dur": "70s" } as React.CSSProperties}>
      <div className="marquee-track py-3">
        {cards.map((c) => (
          <div key={c.key} className="shrink-0 px-2">
            <OrbitCardView card={c} />
          </div>
        ))}
        {cards.map((c) => (
          <div key={`dup-${c.key}`} className="marquee-dup shrink-0 px-2" aria-hidden>
            <OrbitCardView card={c} tabIndex={-1} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Soft NEAR green light beams crossing the hero (inline SVG, no image files). */
function Beams() {
  return (
    <svg className="beams pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="beam-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#00ec97" stopOpacity="0" />
          <stop offset="0.5" stopColor="#00ec97" stopOpacity="1" />
          <stop offset="1" stopColor="#17d9d4" stopOpacity="0" />
        </linearGradient>
        <filter id="beam-blur" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
        <filter id="beam-soft" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
        <radialGradient id="hero-clear" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#021a15" stopOpacity="0.85" />
          <stop offset="0.6" stopColor="#021a15" stopOpacity="0.55" />
          <stop offset="1" stopColor="#021a15" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g opacity="0.22">
        <line x1="-200" y1="820" x2="1640" y2="40" stroke="url(#beam-a)" strokeWidth="90" filter="url(#beam-blur)" />
        <line x1="-200" y1="820" x2="1640" y2="40" stroke="url(#beam-a)" strokeWidth="3" filter="url(#beam-soft)" opacity="0.9" />
      </g>
      <g opacity="0.16">
        <line x1="-100" y1="120" x2="1540" y2="760" stroke="url(#beam-a)" strokeWidth="120" filter="url(#beam-blur)" />
        <line x1="-100" y1="120" x2="1540" y2="760" stroke="url(#beam-a)" strokeWidth="2" filter="url(#beam-soft)" opacity="0.8" />
      </g>
      <g opacity="0.12">
        <line x1="300" y1="-80" x2="1200" y2="980" stroke="url(#beam-a)" strokeWidth="70" filter="url(#beam-blur)" />
      </g>
      {/* dark clear zone behind the text block keeps AA contrast over the beams */}
      <ellipse cx="720" cy="450" rx="460" ry="330" fill="url(#hero-clear)" />
    </svg>
  );
}
