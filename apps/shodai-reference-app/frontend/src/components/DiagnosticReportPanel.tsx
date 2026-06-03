import * as React from "react";
import { Button } from "@/subframe/components/Button";

type DiagnosticReportPanelProps = {
  report: string | null;
};

export function DiagnosticReportPanel({ report }: DiagnosticReportPanelProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy diagnostics:", error);
    }
  }, [report]);

  if (!report) return null;

  return (
    <div className="flex w-full flex-col items-start gap-3 rounded-md border border-solid border-neutral-border bg-neutral-50 px-4 py-4">
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex grow shrink-0 basis-0 flex-col items-start">
          <span className="text-caption-bold font-caption-bold text-default-font">
            Technical diagnostics
          </span>
          <span className="text-caption font-caption text-subtext-color">
            Copy this report and attach it to a bug ticket or support message.
          </span>
        </div>
        <Button variant="neutral-secondary" size="small" onClick={handleCopy}>
          {copied ? "Copied" : "Copy diagnostics"}
        </Button>
      </div>

      <details className="w-full">
        <summary className="cursor-pointer text-caption font-caption text-subtext-color">
          View technical details
        </summary>
        <pre className="mt-3 max-h-72 w-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-default-background px-3 py-3 text-caption font-caption text-subtext-color">
          {report}
        </pre>
      </details>
    </div>
  );
}
