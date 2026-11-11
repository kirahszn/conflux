export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`skeleton block ${className}`} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-bad/40 bg-bad/5 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-bad">Couldn’t load data from the contract</p>
        <p className="mt-1 font-mono text-xs text-muted">{message}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="rounded-md border border-line-strong px-3 py-1.5 text-sm hover:border-paper">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong p-10 text-center">
      <p className="font-display text-lg">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}
