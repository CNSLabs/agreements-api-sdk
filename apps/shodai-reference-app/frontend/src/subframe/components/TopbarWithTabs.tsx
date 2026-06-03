"use client";
/*
 * Documentation:
 * Topbar with tabs — https://app.subframe.com/345c49081508/library?component=Topbar+with+tabs_6da83a87-48a6-4316-a989-ea33ed7ff81e
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
        "group/42c794dd flex h-full cursor-pointer items-center gap-2 border-b-0 border-solid border-neutral-border px-[10px] py-2 hover:bg-neutral-100",
        {
          "border-b border-x-0 border-t-0 border-solid border-brand-primary bg-neutral-100":
            selected,
        },
        className
      )}
      ref={ref}
      {...otherProps}
    >
      {icon ? (
        <SubframeCore.IconWrapper
          className={SubframeUtils.twClassNames(
            "text-body font-body text-subtext-color group-hover/42c794dd:text-default-font",
            { "text-brand-700": selected }
          )}
        >
          {icon}
        </SubframeCore.IconWrapper>
      ) : null}
      {children ? (
        <span
          className={SubframeUtils.twClassNames(
            "text-body font-body text-subtext-color group-hover/42c794dd:text-default-font",
            { "text-brand-700": selected }
          )}
        >
          {children}
        </span>
      ) : null}
    </div>
  );
});

interface TopbarWithTabsRootProps extends React.HTMLAttributes<HTMLElement> {
  rightSlot?: React.ReactNode;
  leftSlot?: React.ReactNode;
  className?: string;
}

const TopbarWithTabsRoot = React.forwardRef<
  HTMLElement,
  TopbarWithTabsRootProps
>(function TopbarWithTabsRoot(
  { rightSlot, leftSlot, className, ...otherProps }: TopbarWithTabsRootProps,
  ref
) {
  return (
    <nav
      className={SubframeUtils.twClassNames(
        "flex h-[60px] w-full items-center justify-center border-b border-solid border-neutral-border bg-default-background px-[10px]",
        className
      )}
      ref={ref}
      {...otherProps}
    >
      <div className="flex grow shrink-0 basis-0 items-center justify-between self-stretch">
        {leftSlot ? (
          <div className="flex min-w-0 items-center gap-[10px] self-stretch">{leftSlot}</div>
        ) : null}
        {rightSlot ? (
          <div className="flex items-center justify-end gap-[10px]">{rightSlot}</div>
        ) : null}
      </div>
    </nav>
  );
});

export const TopbarWithTabs = Object.assign(TopbarWithTabsRoot, {
  NavItem,
});
