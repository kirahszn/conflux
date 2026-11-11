// Extracts one "agents disagree" point from a final report (coordinator synthesis). No React here.

const clean = (s: string) =>
  s
    .replace(/\*\*|`/g, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .trim();

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > max * 0.6 ? cut.lastIndexOf(" ") : max).replace(/[,;:.]$/, "")}…`;
}

/** Picks the shortest bullet under "Where the Agents Disagree" that names at least two agents. */
export function parseDisagreement(report: string, agentNames: string[]): { topic: string; text: string } | null {
  const lines = report.split("\n");
  const start = lines.findIndex((l) => /^#{2,6}\s+Where the Agents Disagree\s*$/.test(l));
  if (start < 0) return null;
  const bullets: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(l)) break;
    if (/^\s*[-*]\s+/.test(l)) bullets.push(l.replace(/^\s*[-*]\s+/, ""));
  }
  const named = bullets.filter((b) => agentNames.filter((n) => b.includes(n)).length >= 2);
  const pick = (named.length ? named : bullets).sort((a, b) => a.length - b.length)[0];
  if (!pick) return null;
  const m = /^\*\*(.+?):?\*\*:?\s*(.*)$/.exec(pick);
  const topic = clean(m ? m[1]! : "Conflicting findings").replace(/:$/, "");
  return { topic, text: truncate(clean(m ? m[2]! : pick), 150) };
}
