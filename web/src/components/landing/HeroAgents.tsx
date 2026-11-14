// Hero illustration: three friendly agent bots (one per role, in role colours) linked to the
// NEAR escrow in the middle. Pure SVG, no assets. Motion is gentle and off for reduced motion.

const AGENTS = [
  { x: 92, y: 92, color: "#3366ff", name: "Research", cls: "float-a" },
  { x: 328, y: 92, color: "#f07c1f", name: "Security", cls: "float-b" },
  { x: 210, y: 300, color: "#8b5cf6", name: "Market", cls: "float-c" },
];
const HUB = { x: 210, y: 168 };

function Bot({ x, y, color, name, cls }: (typeof AGENTS)[number]) {
  return (
    <g className={cls}>
      <g transform={`translate(${x} ${y})`}>
        {/* glow */}
        <circle r="46" fill={color} opacity="0.14" />
        {/* antenna */}
        <line x1="0" y1="-34" x2="0" y2="-46" stroke={color} strokeWidth="3" strokeLinecap="round" />
        <circle cx="0" cy="-49" r="5" fill="#00ec97" />
        {/* head */}
        <rect x="-30" y="-34" width="60" height="48" rx="16" fill="#151a18" stroke={color} strokeWidth="3" />
        {/* visor */}
        <rect x="-21" y="-24" width="42" height="24" rx="10" fill={color} opacity="0.22" />
        {/* eyes */}
        <circle cx="-9" cy="-12" r="5" fill="#edf3f0" />
        <circle cx="9" cy="-12" r="5" fill="#edf3f0" />
        <circle cx="-8" cy="-11" r="2.2" fill="#03140f" />
        <circle cx="10" cy="-11" r="2.2" fill="#03140f" />
        {/* smile */}
        <path d="M -7 4 Q 0 9 7 4" stroke="#edf3f0" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        {/* ears */}
        <rect x="-36" y="-18" width="6" height="16" rx="3" fill={color} />
        <rect x="30" y="-18" width="6" height="16" rx="3" fill={color} />
        {/* label */}
        <text y="36" textAnchor="middle" fontSize="12" fontWeight="600" fill="#c8d2cd" fontFamily="var(--font-geist), sans-serif">
          {name}
        </text>
      </g>
    </g>
  );
}

export function HeroAgents() {
  return (
    <svg viewBox="0 0 420 360" role="img" aria-label="Three independent AI agents connected to a NEAR escrow contract" className="h-auto w-full max-w-md">
      <defs>
        <radialGradient id="hub-glow">
          <stop offset="0%" stopColor="#00ec97" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#00ec97" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* links: agent to escrow */}
      {AGENTS.map((a) => (
        <line key={a.name} x1={a.x} y1={a.y} x2={HUB.x} y2={HUB.y} stroke="#00ec97" strokeOpacity="0.55" strokeWidth="2" className="flow-line" />
      ))}

      {/* escrow hub */}
      <circle cx={HUB.x} cy={HUB.y} r="70" fill="url(#hub-glow)" />
      <g transform={`translate(${HUB.x} ${HUB.y})`}>
        <polygon points="0,-38 33,-19 33,19 0,38 -33,19 -33,-19" fill="#0d1311" stroke="#00ec97" strokeWidth="3" />
        {/* lock */}
        <rect x="-12" y="-4" width="24" height="18" rx="4" fill="#00ec97" />
        <path d="M -7 -4 V -11 A 7 7 0 0 1 7 -11 V -4" stroke="#00ec97" strokeWidth="3.2" fill="none" />
        <circle cx="0" cy="5" r="2.6" fill="#03140f" />
        <text y="-50" textAnchor="middle" fontSize="11" fontWeight="700" letterSpacing="1.5" fill="#00ec97" fontFamily="var(--font-jetbrains), monospace">
          NEAR ESCROW
        </text>
      </g>

      {AGENTS.map((a) => (
        <Bot key={a.name} {...a} />
      ))}
    </svg>
  );
}
