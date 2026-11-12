/** Conflux logo mark: three streams merging into one green stream. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#03140f" stroke="#2c3430" strokeWidth="2" />
      <path d="M14 18 C 26 18, 28 32, 32 32" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M14 46 C 26 46, 28 32, 32 32" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M10 32 H 32" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M32 32 H 52" fill="none" stroke="#00ec97" strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="32" cy="32" r="5.5" fill="#00ec97" />
    </svg>
  );
}
