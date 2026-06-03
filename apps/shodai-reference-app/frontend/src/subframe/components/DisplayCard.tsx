"use client";
/*
 * Documentation:
 * DisplayCard — https://app.subframe.com/345c49081508/library?component=DisplayCard_aa14eb47-2113-4230-b02c-b9a1b1766e9c
 */

import React from "react";
import * as SubframeCore from "@subframe/core";
import * as SubframeUtils from "../utils";

interface DisplayCardRootProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title" | "content"> {
  variant?: "default" | "small";
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  footer?: boolean;
  divider?: boolean;
  hPrefix?: React.ReactNode;
  hSuffix?: React.ReactNode;
  headActions?: React.ReactNode;
  content?: React.ReactNode;
  footActions?: React.ReactNode;
  className?: string;
}

const DisplayCardRoot = React.forwardRef<HTMLDivElement, DisplayCardRootProps>(
  function DisplayCardRoot(
    {
      variant = "default",
      icon = null,
      title,
      description,
      footer = false,
      divider = false,
      hPrefix,
      hSuffix,
      headActions,
      content,
      footActions,
      className,
      ...otherProps
    }: DisplayCardRootProps,
    ref
  ) {
    return (
      <div
        className={SubframeUtils.twClassNames(
          "group/aa14eb47 flex w-full min-w-[224px] flex-col items-start rounded-lg border border-solid border-neutral-border bg-default-background shadow-sm",
          className
        )}
        ref={ref}
        {...otherProps}
      >
        <div
          className={SubframeUtils.twClassNames(
            "flex w-full items-center justify-between px-6 pt-6 pb-1",
            {
              "border-b border-x-0 border-t-0 border-solid border-neutral-border px-4 py-4":
                divider,
              "px-4 pt-4 pb-1": variant === "small",
            }
          )}
        >
          <div className="flex items-center gap-2">
            {hPrefix ? (
              <div className="flex items-start gap-2">{hPrefix}</div>
            ) : null}
            <div className="flex flex-col items-start">
              <div className="flex items-end gap-1">
                <div className="flex items-end gap-1 py-1">
                  {icon ? (
                    <SubframeCore.IconWrapper className="text-heading-3 font-heading-3 text-default-font">
                      {icon}
                    </SubframeCore.IconWrapper>
                  ) : null}
                </div>
                {title ? (
                  <span className="text-heading-3 font-heading-3 text-default-font">
                    {title}
                  </span>
                ) : null}
              </div>
              {description ? (
                <span className="text-caption font-caption text-subtext-color">
                  {description}
                </span>
              ) : null}
            </div>
            {hSuffix ? (
              <div className="flex items-start gap-2">{hSuffix}</div>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {headActions ? (
              <div className="flex items-center gap-1">{headActions}</div>
            ) : null}
          </div>
        </div>
        {content ? (
          <div className="flex w-full flex-col items-start">{content}</div>
        ) : null}
        <div
          className={SubframeUtils.twClassNames(
            "hidden w-full items-center justify-center border-t border-solid border-neutral-border px-6 py-4",
            { flex: footer }
          )}
        >
          {footActions ? (
            <div className="flex grow shrink-0 basis-0 items-center justify-center">
              {footActions}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
);

export const DisplayCard = DisplayCardRoot;
