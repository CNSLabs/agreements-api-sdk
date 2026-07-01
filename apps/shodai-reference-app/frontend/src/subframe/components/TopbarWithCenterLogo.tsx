"use client";
/*
 * Documentation:
 * Topbar with center logo — https://app.subframe.com/345c49081508/library?component=Topbar+with+center+logo_913b7c80-24e7-4703-98b2-33b06df146a5
 */

import React from "react";
import * as SubframeCore from "@subframe/core";
import * as SubframeUtils from "../utils";

interface NavItemProps extends React.HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

const NavItem = React.forwardRef<HTMLDivElement, NavItemProps>(function NavItem(
  {
    selected = false,
    icon = null,
    children,
    className,
    ...otherProps
  }: NavItemProps,
  ref
) {
  return (
    <div
      className={SubframeUtils.twClassNames(
        "group/f86eab8a flex cursor-pointer items-center justify-center gap-2 rounded-md px-2 py-1",
        className
      )}
      ref={ref}
      {...otherProps}
    >
      {icon ? (
        <SubframeCore.IconWrapper
          className={SubframeUtils.twClassNames(
            "text-body font-body text-subtext-color group-hover/f86eab8a:text-default-font",
            { "text-default-font": selected }
          )}
        >
          {icon}
        </SubframeCore.IconWrapper>
      ) : null}
      {children ? (
        <span
          className={SubframeUtils.twClassNames(
            "text-body font-body text-subtext-color group-hover/f86eab8a:text-default-font",
            { "text-body-bold font-body-bold text-default-font": selected }
          )}
        >
          {children}
        </span>
      ) : null}
    </div>
  );
});

interface TopbarWithCenterLogoRootProps
  extends React.HTMLAttributes<HTMLElement> {
  leftSlot?: React.ReactNode;
  centerSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
}

const TopbarWithCenterLogoRoot = React.forwardRef<
  HTMLElement,
  TopbarWithCenterLogoRootProps
>(function TopbarWithCenterLogoRoot(
  {
    leftSlot,
    centerSlot,
    rightSlot,
    className,
    ...otherProps
  }: TopbarWithCenterLogoRootProps,
  ref
) {
  return (
    <nav
      className={SubframeUtils.twClassNames(
        "flex w-full items-center gap-4 border-b border-solid border-neutral-border bg-default-background px-4 py-4",
        className
      )}
      ref={ref}
      {...otherProps}
    >
      {leftSlot ? (
        <div className="flex grow shrink-0 basis-0 items-center gap-2">
          {leftSlot}
        </div>
      ) : null}
      {centerSlot ? (
        <div className="flex grow shrink-0 basis-0 items-center justify-center gap-1">
          {centerSlot}
        </div>
      ) : null}
      {rightSlot ? (
        <div className="flex grow shrink-0 basis-0 items-center justify-end gap-2">
          {rightSlot}
        </div>
      ) : null}
    </nav>
  );
});

export const TopbarWithCenterLogo = Object.assign(TopbarWithCenterLogoRoot, {
  NavItem,
});
