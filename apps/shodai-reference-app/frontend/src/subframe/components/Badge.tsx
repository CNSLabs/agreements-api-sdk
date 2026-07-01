"use client";
/*
 * Documentation:
 * Avatar — https://app.subframe.com/345c49081508/library?component=Avatar_bec25ae6-5010-4485-b46b-cf79e3943ab2
 * Badge — https://app.subframe.com/345c49081508/library?component=Badge_97bdb082-1124-4dd7-a335-b14b822d0157
 */

import React from "react";
import * as SubframeCore from "@subframe/core";
import * as SubframeUtils from "../utils";
import { Avatar } from "./Avatar";

interface BadgeRootProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "brand" | "neutral" | "error" | "warning" | "success";
  icon?: React.ReactNode;
  children?: React.ReactNode;
  iconRight?: React.ReactNode;
  avatar?: boolean;
  className?: string;
}

const BadgeRoot = React.forwardRef<HTMLDivElement, BadgeRootProps>(
  function BadgeRoot(
    {
      variant = "brand",
      icon = null,
      children,
      iconRight = null,
      avatar = false,
      className,
      ...otherProps
    }: BadgeRootProps,
    ref
  ) {
    return (
      <div
        className={SubframeUtils.twClassNames(
          "group/97bdb082 flex h-6 items-center gap-1 rounded-md border border-solid border-brand-100 bg-brand-100 px-2",
          {
            "border border-solid border-success-100 bg-success-100":
              variant === "success",
            "border border-solid border-warning-100 bg-warning-100":
              variant === "warning",
            "border border-solid border-error-100 bg-error-100":
              variant === "error",
            "border border-solid border-neutral-100 bg-neutral-100":
              variant === "neutral",
          },
          className
        )}
        ref={ref}
        {...otherProps}
      >
        {icon ? (
          <SubframeCore.IconWrapper
            className={SubframeUtils.twClassNames(
              "text-caption font-caption text-brand-700",
              {
                "text-success-800": variant === "success",
                "text-warning-800": variant === "warning",
                "text-error-700": variant === "error",
                "text-neutral-700": variant === "neutral",
              }
            )}
          >
            {icon}
          </SubframeCore.IconWrapper>
        ) : null}
        <Avatar
          className={SubframeUtils.twClassNames("hidden", { flex: avatar })}
          size={avatar ? "x-small" : undefined}
        >
          A
        </Avatar>
        {children ? (
          <span
            className={SubframeUtils.twClassNames(
              "whitespace-nowrap text-caption font-caption text-brand-800",
              {
                "text-success-800": variant === "success",
                "text-warning-800": variant === "warning",
                "text-error-800": variant === "error",
                "text-neutral-700": variant === "neutral",
              }
            )}
          >
            {children}
          </span>
        ) : null}
        {iconRight ? (
          <SubframeCore.IconWrapper
            className={SubframeUtils.twClassNames(
              "text-caption font-caption text-brand-700",
              {
                "text-success-800": variant === "success",
                "text-warning-800": variant === "warning",
                "text-error-700": variant === "error",
                "text-neutral-700": variant === "neutral",
              }
            )}
          >
            {iconRight}
          </SubframeCore.IconWrapper>
        ) : null}
      </div>
    );
  }
);

export const Badge = BadgeRoot;
