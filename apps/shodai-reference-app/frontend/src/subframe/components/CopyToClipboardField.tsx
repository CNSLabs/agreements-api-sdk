"use client";
/*
 * Documentation:
 * Copy to clipboard button — https://app.subframe.com/345c49081508/library?component=Copy+to+clipboard+button_e8c76626-6462-4f2f-b595-38d530d427e8
 * Copy to clipboard field — https://app.subframe.com/345c49081508/library?component=Copy+to+clipboard+field_1e2e1a38-8b4a-41bd-b224-b893c92a0495
 */

import React from "react";
import * as SubframeUtils from "../utils";
import { CopyToClipboardButton } from "./CopyToClipboardButton";

interface CopyToClipboardFieldRootProps
  extends React.HTMLAttributes<HTMLDivElement> {
  text?: React.ReactNode;
  className?: string;
}

const CopyToClipboardFieldRoot = React.forwardRef<
  HTMLDivElement,
  CopyToClipboardFieldRootProps
>(function CopyToClipboardFieldRoot(
  { text, className, ...otherProps }: CopyToClipboardFieldRootProps,
  ref
) {
  return (
    <div
      className={SubframeUtils.twClassNames(
        "flex items-start gap-1.5 rounded-md border border-solid border-neutral-border bg-neutral-50 pl-2 pr-0.5 py-0.5",
        className
      )}
      ref={ref}
      {...otherProps}
    >
      <div className="flex grow shrink-0 basis-0 items-start gap-1 py-0.5">
        {text ? (
          <span className="grow shrink-0 basis-0 whitespace-pre-wrap text-monospace-body font-monospace-body text-subtext-color">
            {text}
          </span>
        ) : null}
      </div>
      <CopyToClipboardButton
        clipboardText={text}
        tooltipText="Copy to clipboard"
      />
    </div>
  );
});

export const CopyToClipboardField = CopyToClipboardFieldRoot;
