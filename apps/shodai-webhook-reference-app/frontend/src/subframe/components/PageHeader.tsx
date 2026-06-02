// @subframe/sync-disable
// TEMPORARY DISABLED TO FIX ISSUES
"use client";
/*
 * Documentation:
 * PageHeader — https://app.subframe.com/345c49081508/library?component=PageHeader_ea7ebbf3-27b3-43a5-8b86-b7922834b244
 */

import React from "react";
import * as SubframeUtils from "../utils";

interface PageHeaderRootProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  showTags?: boolean;
  actions?: React.ReactNode;
  tags?: React.ReactNode;
  controls?: React.ReactNode;
  className?: string;
}

const PageHeaderRoot = React.forwardRef<HTMLDivElement, PageHeaderRootProps>(
  function PageHeaderRoot(
    {
      title,
      subtitle,
      showTags = false,
      actions,
      tags,
      controls,
      className,
      ...otherProps
    }: PageHeaderRootProps,
    ref
  ) {
    return (
      <div
        className={SubframeUtils.twClassNames(
          "group/ea7ebbf3 flex w-full flex-col items-center justify-center gap-6 border-b border-solid border-neutral-border bg-default-background px-6 py-8 mobile:px-4 mobile:py-8 mobile:min-w-0 mobile:flex-col mobile:flex-nowrap mobile:gap-4",
          className
        )}
        ref={ref}
        {...otherProps}
      >
        <div className="flex w-full max-w-[1280px] flex-col items-start gap-1 mobile:order-2 mobile:w-full">
          <div className="flex w-full flex-wrap items-center gap-1 mobile:flex-col mobile:items-stretch mobile:gap-4">
            <div className="flex grow shrink-0 basis-0 items-start gap-1 mobile:order-2 mobile:flex-col">
              {title ? (
                <span className="whitespace-nowrap text-heading-1 font-heading-1 text-default-font mobile:whitespace-normal mobile:break-words">
                  {title}
                </span>
              ) : null}
            </div>
            {actions ? (
              <div className="flex flex-wrap items-center gap-2 mobile:order-1 mobile:justify-end mobile:[&_button]:h-7 mobile:[&_button]:min-h-7">
                {actions}
              </div>
            ) : null}
          </div>
          {subtitle ? (
            <span className="text-body font-body text-subtext-color">
              {subtitle}
            </span>
          ) : null}
          {tags ? (
            <div
              className={SubframeUtils.twClassNames(
                "hidden flex-wrap items-center gap-2",
                { flex: showTags }
              )}
            >
              {tags}
            </div>
          ) : null}
        </div>
        {controls ? (
          <div className="flex w-full max-w-[1280px] items-center gap-1 overflow-x-auto mobile:order-3">
            {controls}
          </div>
        ) : null}
      </div>
    );
  }
);

export const PageHeader = PageHeaderRoot;
