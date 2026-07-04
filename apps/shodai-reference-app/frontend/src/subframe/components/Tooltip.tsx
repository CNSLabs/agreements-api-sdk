"use client";
/*
 * Documentation:
 * Tooltip — https://app.subframe.com/345c49081508/library?component=Tooltip_ccebd1e9-f6ac-4737-8376-0dfacd90c9f3
 */

import React from "react";
import * as SubframeUtils from "../utils";

interface TooltipRootProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
}

const TooltipRoot = React.forwardRef<HTMLDivElement, TooltipRootProps>(
  function TooltipRoot(
    { children, className, ...otherProps }: TooltipRootProps,
    ref
  ) {
    return (
      <div
        className={SubframeUtils.twClassNames(
          "flex flex-col items-start gap-2 rounded-none border border-solid border-neutral-border bg-neutral-100 px-2 py-1 shadow-none",
          className
        )}
        ref={ref}
        {...otherProps}
      >
        {children ? (
          <span className="text-caption font-caption text-default-font">
            {children}
          </span>
        ) : null}
      </div>
    );
  }
);

export const Tooltip = TooltipRoot;
