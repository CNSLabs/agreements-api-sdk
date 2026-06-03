// @subframe/sync-disable

import React from "react";
import { FeatherAlertCircle } from "@subframe/core";
import { Button } from "@/subframe/components/Button";

export interface ValidationErrorBannerProps {
  /** Number of validation errors (e.g. "3 validation error(s)") */
  errorCount: number;
  /** Short summary (e.g. "3 validation error(s) to be resolved") */
  title?: string;
  /** Longer description (e.g. "Please review and fix the errors in the form before deploying.") */
  description?: string;
  /** Optional action button. Omit for non-actionable errors (e.g. not owner, unexpected error). */
  action?: {
    label: string;
    icon?: React.ReactNode;
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  };
  className?: string;
}

const DEFAULT_TITLE = (count: number) =>
  `${count} validation error${count !== 1 ? "s" : ""} to be resolved`;
const DEFAULT_DESCRIPTION =
  "Please review and fix the errors in the form before deploying the agreement.";

export function ValidationErrorBanner({
  errorCount,
  title,
  description,
  action,
  className,
}: ValidationErrorBannerProps) {
  return (
    <div
      className={`flex w-full items-start gap-4 rounded-md border border-solid border-error-600 bg-error-50 px-6 py-4 ${className ?? ""}`}
    >
      <FeatherAlertCircle className="text-heading-3 font-heading-3 text-error-600 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="text-body-bold font-body-bold text-default-font">
          {title ?? DEFAULT_TITLE(errorCount)}
        </span>
        <span className="text-body font-body text-subtext-color">
          {description ?? DEFAULT_DESCRIPTION}
        </span>
      </div>
      {action ? (
        <Button
          variant="neutral-secondary"
          size="small"
          icon={action.icon}
          onClick={action.onClick}
          className="shrink-0"
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
