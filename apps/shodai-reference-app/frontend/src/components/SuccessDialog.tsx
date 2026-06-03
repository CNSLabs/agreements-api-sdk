import * as React from "react";
import { DialogLayout } from "@/subframe/layouts/DialogLayout";
import { IconWithBackground } from "@/subframe/components/IconWithBackground";
import { FeatherCheck } from "@subframe/core";

type SuccessDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Default: success check icon */
  icon?: React.ReactNode;
  title: string;
  message?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Default: w-[576px] max-w-full (use fixed width + max-w-full for responsive) */
  widthClassName?: string;
};

const DEFAULT_ICON = (
  <IconWithBackground variant="success" size="large" icon={<FeatherCheck />} square={false} />
);

export function SuccessDialog({
  open,
  onOpenChange,
  icon = DEFAULT_ICON,
  title,
  message,
  children,
  footer,
  widthClassName = "w-[576px] max-w-full",
}: SuccessDialogProps) {
  return (
    <DialogLayout open={open} onOpenChange={onOpenChange}>
      <div className={`flex ${widthClassName} flex-col items-start gap-6 bg-default-background px-6 py-6 mobile:px-4 mobile:py-4`}>
        <div className="flex w-full flex-col items-center justify-center gap-6">
          {icon}
          <div className="flex w-full flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <span className="text-heading-1 font-heading-1 text-default-font">{title}</span>
              {message ? (
                <span className="text-body font-body text-subtext-color text-center">{message}</span>
              ) : null}
            </div>
          </div>
        </div>

        {children}

        {footer ? <div className="flex w-full items-center justify-end gap-3">{footer}</div> : null}
      </div>
    </DialogLayout>
  );
}
