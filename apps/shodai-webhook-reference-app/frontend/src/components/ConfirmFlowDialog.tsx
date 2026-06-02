import * as React from "react";
import { DialogLayout } from "@/subframe/layouts/DialogLayout";
import { IconButton } from "@/subframe/components/IconButton";
import { Loader } from "@/subframe/components/Loader";
import { FeatherX } from "@subframe/core";

type ConfirmFlowDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isWorking?: boolean;

  title: string;

  progressTitle?: string;
  progressMessage?: string;

  children?: React.ReactNode;
  footer?: React.ReactNode;

  /** Default: w-[576px] max-w-full (use fixed width + max-w-full for responsive) */
  widthClassName?: string;
};

export function ConfirmFlowDialog({
  open,
  onOpenChange,
  isWorking = false,
  title,
  progressTitle = "Working…",
  progressMessage = "Please wait a moment.",
  children,
  footer,
  widthClassName = "w-[576px] max-w-full",
}: ConfirmFlowDialogProps) {
  return (
    <DialogLayout open={open} onOpenChange={onOpenChange}>
      {isWorking ? (
        <div
          className={`flex ${widthClassName} flex-col items-center justify-center gap-8 bg-default-background px-6 py-12`}
        >
          <Loader size="large" />
          <div className="flex w-full flex-col items-center gap-2">
            <span className="text-heading-1 font-heading-1 text-default-font">{progressTitle}</span>
            <span className="whitespace-pre-wrap text-body font-body text-subtext-color text-center">
              {progressMessage}
            </span>
          </div>
        </div>
      ) : (
        <div
          className={`flex ${widthClassName} flex-col items-start gap-6 bg-default-background px-6 py-6 mobile:px-4 mobile:py-4`}
        >
          <div className="flex w-full items-center justify-between">
            <span className="text-heading-1 font-heading-1 text-default-font">{title}</span>
            <IconButton icon={<FeatherX />} onClick={() => onOpenChange(false)} />
          </div>

          {children}

          {footer ? <div className="flex w-full items-center justify-end gap-3">{footer}</div> : null}
        </div>
      )}
    </DialogLayout>
  );
}

