// Report format + quality gate. IDENTICAL copy in agent/src/report.ts —
// the agent applies it before submitting, the coordinator when checking.

const ROLE_TITLES: Record<string, string> = { research: "Research", security: "Security", market: "Market" };
const ROLE_SECTIONS: Record<string, string> = {
  research: "## What It Does",
  security: "## Audits and Incidents",
  market: "## Market Position and Token",
};
export const MIN_REPORT_CHARS = 1000;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const titleFor = (role: string) => `# ${ROLE_TITLES[role] ?? cap(role)} Report`;
export const requiredHeadings = (role: string) =>
  ["## Summary", ROLE_SECTIONS[role], "## Findings", "## Risks and Unknowns", "## Sources"].filter(
    (h): h is string => Boolean(h),
  );

/** The report = model content from its first "# " heading line onward (drops any preamble). */
export function extractReport(content: string): string | null {
  const m = /^# /m.exec(content);
  return m ? content.slice(m.index) : null;
}

/** Returns a list of problems; empty = passes. finishReason undefined = not checked. */
export function qualityProblems(report: string, role: string, finishReason?: string | null): string[] {
  const problems: string[] = [];
  if (!report.startsWith(titleFor(role))) problems.push(`does not start with "${titleFor(role)}"`);
  const lines = report.split("\n").map((l) => l.trim());
  for (const h of requiredHeadings(role)) if (!lines.includes(h)) problems.push(`missing heading "${h}"`);
  if (report.length < MIN_REPORT_CHARS) problems.push(`only ${report.length} chars (< ${MIN_REPORT_CHARS})`);
  if (finishReason !== undefined && finishReason !== "stop") problems.push(`finish_reason=${finishReason} (not stop)`);
  const src = report.split(/^## Sources[ \t]*$/m)[1]?.split(/^## /m)[0] ?? "";
  if (!/https?:\/\/\S+/.test(src)) problems.push("no URL in ## Sources");
  return problems;
}
