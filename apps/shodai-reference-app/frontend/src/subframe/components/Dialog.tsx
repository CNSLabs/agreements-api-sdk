// @subframe/sync-disable
// Disabled to ensure dialog shows above all other content

"use client";
/*
 * Documentation:
 * Dialog — https://app.subframe.com/345c49081508/library?component=Dialog_ca59db17-43fb-4247-8094-3c55162e902d
 */

import React from "react";
import * as SubframeCore from "@subframe/core";
import * as SubframeUtils from "../utils";

interface ContentProps
  extends React.ComponentProps<typeof SubframeCore.Dialog.Content> {
  children?: React.ReactNode;
  className?: string;
}

const Content = React.forwardRef<HTMLDivElement, ContentProps>(function Content(
  { children, className, ...otherProps }: ContentProps,
  ref
) {
  return children ? (
    <SubframeCore.Dialog.Content asChild={true} {...otherProps}>
      <div
        className={SubframeUtils.twClassNames(
          "z-[101] flex min-w-[320px] flex-col items-start gap-2 rounded-md border border-solid border-neutral-border bg-default-background shadow-lg max-h-[90vh] overflow-auto",
          className
        )}
        ref={ref}
      >
        {children}
      </div>
    </SubframeCore.Dialog.Content>
  ) : null;
});

interface DialogRootProps
  extends React.ComponentProps<typeof SubframeCore.Dialog.Root> {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const DialogRoot = React.forwardRef<HTMLDivElement, DialogRootProps>(
  function DialogRoot(
    { children, className, ...otherProps }: DialogRootProps,
    ref
  ) {
    return children ? (
      <SubframeCore.Dialog.Root asChild={true} {...otherProps}>
        <div
          className={SubframeUtils.twClassNames(
            "z-[100] flex h-full w-full flex-col items-center justify-center gap-2 bg-[#00000099]",
            className
          )}
          ref={ref}
        >
          {children}
        </div>
      </SubframeCore.Dialog.Root>
    ) : null;
  }
);

export const Dialog = Object.assign(DialogRoot, {
  Content,
});
