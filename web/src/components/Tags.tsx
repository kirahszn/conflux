import type { TaskStatus } from "@/lib/near";
import { roleVars } from "@/lib/roles";

export function RoleTag({ role, className = "" }: { role: string; className?: string }) {
  return (
    <span style={roleVars(role)} className={`role-tag inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${className}`}>
      <span className="role-bar h-1.5 w-1.5 rounded-full" aria-hidden />
      {role}
    </span>
  );
}

const STATUS: Record<TaskStatus, { label: string; cls: string }> = {
  Funded: { label: "Funded", cls: "bg-[#eef3ff] text-[#1d4ed8]" },
  InProgress: { label: "In progress", cls: "bg-[#fff6db] text-[#8a5a00]" },
  Submitted: { label: "Submitted", cls: "bg-[#f4eeff] text-[#6b2fd6]" },
  Settled: { label: "Settled", cls: "bg-green-soft text-green-ink" },
  Cancelled: { label: "Cancelled", cls: "bg-[#efefea] text-muted" },
  Expired: { label: "Expired", cls: "bg-[#efefea] text-muted" },
};

export function StatusPill({ status }: { status: TaskStatus }) {
  const s = STATUS[status];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
}
