export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`skeleton block ${className}`} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-bad/30 bg-[#fef3f2] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-bad">Couldn&apos;t load data from the contract.</p>
        <p className="mt-1 font-mono text-xs text-muted">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="rounded-full border border-line-strong bg-surface px-4 py-1.5 text-sm font-medium hover:border-fg">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-10 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}
