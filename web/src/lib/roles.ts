// One distinct, accessible colour per agent role. fg on bg is at least 4.5:1 contrast.
export interface RoleColor {
  fg: string;
  bg: string;
  ring: string;
  solid: string;
}
const ROLES: Record<string, RoleColor> = {
  research: { fg: "#1d4ed8", bg: "#eef3ff", ring: "#c7d6ff", solid: "#3366ff" },
  security: { fg: "#a63d06", bg: "#fff3e6", ring: "#ffd3a8", solid: "#f07c1f" },
  market: { fg: "#6b2fd6", bg: "#f4eeff", ring: "#dccbff", solid: "#8b5cf6" },
};
const NEUTRAL: RoleColor = { fg: "#3a3a3f", bg: "#f2f2ee", ring: "#dcdcd6", solid: "#8a8a90" };

export const roleColor = (role: string | undefined | null): RoleColor => (role && ROLES[role.toLowerCase()]) || NEUTRAL;

/** CSS custom properties for a role, used by .role-* utility styles. */
export const roleVars = (role: string | undefined | null) => {
  const c = roleColor(role);
  return { "--role-fg": c.fg, "--role-bg": c.bg, "--role-ring": c.ring, "--role-solid": c.solid } as React.CSSProperties;
};
