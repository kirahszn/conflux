import { explorer, network } from "@/config/network";

export const GITHUB_URL = "https://github.com/kirahszn/conflux";

export function Footer() {
  const link = "inline-flex min-h-11 items-center text-muted underline decoration-line-strong underline-offset-4 transition hover:text-fg hover:decoration-green";
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-4 text-xs text-faint sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <p>Conflux, made for the NEAR Hackathon.</p>
        <div className="flex flex-wrap items-center gap-x-5">
          {network.contractId && (
            <a className={link} href={explorer.account(network.contractId)} target="_blank" rel="noreferrer" title={network.contractId}>
              Contract ↗
            </a>
          )}
          <a className={link} href={GITHUB_URL} target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
