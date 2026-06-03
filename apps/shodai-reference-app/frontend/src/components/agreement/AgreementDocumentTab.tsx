import * as React from "react";
import MarkdownDocumentView from "@/components/MarkdownDocumentView";
import ErrorBoundary from "@/components/ErrorBoundary";
import ErrorCard from "@/components/ErrorCard";
import type { Control } from "react-hook-form";

const MarkdownFallback = () => (
  <ErrorCard
    title="Document Rendering Error"
    message="There was a problem displaying the document content."
    onRetry={() => window.location.reload()}
    retryText="Reload Document"
  />
);

export interface AgreementDocumentTabProps {
  content: { type: string; data: string };
  variables: Record<string, unknown>;
  control: Control<any>;
  errors: Record<string, unknown>;
  nextActions: unknown[];
  userAddress: string;
}

export function AgreementDocumentTab({
  content,
  variables,
  control,
  errors,
  nextActions,
  userAddress,
}: AgreementDocumentTabProps) {
  return (
    <ErrorBoundary fallback={<MarkdownFallback />}>
      <MarkdownDocumentView
        content={content || { type: "md", data: "No content available" }}
        variables={variables}
        control={control}
        errors={errors || {}}
        nextActions={nextActions}
        userAddress={userAddress}
        initialParams={{}}
        isInitializing={false}
      />
    </ErrorBoundary>
  );
}
