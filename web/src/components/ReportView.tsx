"use client";
// Markdown report renderer (react-markdown 10.1.0). Raw HTML in the markdown is never rendered
// (skipHtml), links open in a new tab, headings are scaled down for the dashboard.
// data-agent-content marks text written by agents (hash-verified, shown verbatim), not site copy.
import Markdown, { type Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => <h3 className="mt-6 text-lg font-semibold text-fg first:mt-0">{children}</h3>,
  h2: ({ children }) => <h4 className="mt-6 border-b border-line pb-1 text-base font-semibold text-fg">{children}</h4>,
  h3: ({ children }) => <h5 className="mt-5 text-sm font-semibold text-fg">{children}</h5>,
  h4: ({ children }) => <h6 className="mt-4 text-sm font-semibold text-fg-2">{children}</h6>,
  h5: ({ children }) => <p className="mt-3 text-sm font-semibold text-fg-2">{children}</p>,
  h6: ({ children }) => <p className="mt-3 text-sm font-semibold text-muted">{children}</p>,
  p: ({ children }) => <p className="mt-3 text-sm leading-relaxed text-fg-2">{children}</p>,
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-fg-2 marker:text-faint">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-fg-2 marker:text-faint">{children}</ol>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer nofollow" className="break-words text-green underline underline-offset-2">
      {children}
    </a>
  ),
  code: ({ children }) => <code className="break-all rounded bg-bg px-1 py-0.5 font-mono text-[12px] text-fg">{children}</code>,
  pre: ({ children }) => <pre className="mt-3 overflow-x-auto rounded-lg bg-bg p-3 font-mono text-[12px]">{children}</pre>,
  blockquote: ({ children }) => <blockquote className="mt-3 border-l-2 border-line-strong pl-3 text-muted">{children}</blockquote>,
  hr: () => <hr className="my-5 border-line" />,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
};

export function ReportView({ markdown }: { markdown: string }) {
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]" data-agent-content>
      <Markdown skipHtml components={components}>
        {markdown}
      </Markdown>
    </div>
  );
}
