import * as React from "react";
import MarkdownDocumentView from "@/components/MarkdownDocumentView";
import type { MarkdownDocumentViewProps } from "@/components/MarkdownDocumentView";
import ErrorBoundary from "@/components/ErrorBoundary";
import ErrorCard from "@/components/ErrorCard";
import { Loader } from "@/subframe/components/Loader";
import type { Control, FieldErrors } from "react-hook-form";

const MarkdownFallback = () => (
  <ErrorCard
    title="Document Rendering Error"
    message="There was a problem displaying the document content."
    onRetry={() => window.location.reload()}
    retryText="Reload Document"
  />
);

export interface DocumentDocumentTabProps {
  content: { type: string; data: string } | null;
  variables: Record<string, unknown> | null;
  control: Control<any>;
  errors: FieldErrors;
  userAddress: string;
  initialParams: Record<string, string>;
}

export function DocumentDocumentTab({
  content,
  variables,
  control,
  errors,
  userAddress,
  initialParams,
}: DocumentDocumentTabProps) {
  const emptyNextActions = React.useMemo(() => [], []);
  const emptyErrors = React.useMemo(() => ({}), []);

  if (!content || !variables) {
    return (
      <div className="flex w-full max-w-[1280px] flex-col items-center justify-center gap-4 rounded-md bg-default-background px-6 py-12 min-h-[200px]">
        <Loader size="medium" />
        <span className="text-body font-body text-subtext-color">Loading document…</span>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-[1280px] flex-col items-start gap-6 rounded-md bg-default-background px-6 py-8">
      <ErrorBoundary fallback={<MarkdownFallback />}>
        <MarkdownDocumentView
          content={content as MarkdownDocumentViewProps["content"]}
          variables={variables as MarkdownDocumentViewProps["variables"]}
          control={control}
          errors={errors || emptyErrors}
          nextActions={emptyNextActions}
          userAddress={userAddress}
          initialParams={initialParams}
          isInitializing={true}
        />
      </ErrorBoundary>
    </div>
  );
}
