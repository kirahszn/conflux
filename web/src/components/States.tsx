export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`skeleton block ${className}`} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-bad/40 bg-bad/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-bad">Couldn&apos;t load data from the contract.</p>
        <p className="mt-1 font-mono text-xs text-muted">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-medium hover:border-fg">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-surface/60 px-6 py-8 text-center">
      <p className="text-base font-semibold text-fg">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}
