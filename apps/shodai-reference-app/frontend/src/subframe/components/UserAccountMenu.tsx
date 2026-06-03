// @subframe/sync-disable
// TEMPORARY DISABLED TO FIX ISSUES - CLIPBOARD BUTTON CANT BE WITHIN THE TRIGGER OTHERWISE YOU CANNOT CLICK IT
"use client";
/*
 * Documentation:
 * Avatar — https://app.subframe.com/345c49081508/library?component=Avatar_bec25ae6-5010-4485-b46b-cf79e3943ab2
 * Copy to clipboard button — https://app.subframe.com/345c49081508/library?component=Copy+to+clipboard+button_e8c76626-6462-4f2f-b595-38d530d427e8
 * Dropdown Menu — https://app.subframe.com/345c49081508/library?component=Dropdown+Menu_99951515-459b-4286-919e-a89e7549b43b
 * UserAccountMenu — https://app.subframe.com/345c49081508/library?component=UserAccountMenu_5034a436-1c2d-4ad4-9993-54259f43fb50
 */

import React from "react";
import * as SubframeCore from "@subframe/core";
import * as SubframeUtils from "../utils";
import { Avatar } from "./Avatar";
import { CopyToClipboardButton } from "./CopyToClipboardButton";
import { DropdownMenu } from "./DropdownMenu";

interface UserAccountMenuRootProps
  extends React.HTMLAttributes<HTMLDivElement> {
  email?: React.ReactNode;
  walletAddress?: React.ReactNode;
  /** Avatar image URL (e.g. from address via effigy.im) */
  image?: string;
  /** Full address for copy-to-clipboard */
  clipboardText?: string;
  menuItems?: React.ReactNode;
  className?: string;
}

const UserAccountMenuRoot = React.forwardRef<
  HTMLDivElement,
  UserAccountMenuRootProps
>(function UserAccountMenuRoot(
  {
    email,
    walletAddress,
    image,
    clipboardText = "",
    menuItems,
    className,
    ...otherProps
  }: UserAccountMenuRootProps,
  ref
) {
  return (
    <SubframeCore.DropdownMenu.Root>
      <div
        className={SubframeUtils.twClassNames(
          "group/5034a436 flex cursor-pointer items-center gap-2 rounded-md border border-solid border-neutral-border bg-default-background px-1 py-1 shadow-sm hover:shadow-md",
          className
        )}
        ref={ref}
        {...otherProps}
      >
        <SubframeCore.DropdownMenu.Trigger asChild={true}>
          <div className="flex cursor-pointer items-center gap-2 min-w-0">
            <Avatar
              size="small"
              image={image}
            >
              {walletAddress ? String(walletAddress).slice(2, 3).toUpperCase() : "?"}
            </Avatar>
            <div className="flex flex-col items-start min-w-0">
              {email ? (
                <span className="text-caption font-caption text-default-font">
                  {email}
                </span>
              ) : null}
              {walletAddress ? (
                <span className="text-caption font-caption text-subtext-color truncate">
                  {walletAddress}
                </span>
              ) : null}
            </div>
          </div>
        </SubframeCore.DropdownMenu.Trigger>
        <CopyToClipboardButton clipboardText={clipboardText} tooltipText="Copy Address" />
      </div>
      <SubframeCore.DropdownMenu.Portal>
        <SubframeCore.DropdownMenu.Content
          side="bottom"
          align="end"
          sideOffset={4}
          asChild={true}
        >
          <DropdownMenu className="z-[100]">
            {menuItems ? (
              <div className="flex w-full flex-col items-start">
                {menuItems}
              </div>
            ) : null}
          </DropdownMenu>
        </SubframeCore.DropdownMenu.Content>
      </SubframeCore.DropdownMenu.Portal>
    </SubframeCore.DropdownMenu.Root>
  );
});

export const UserAccountMenu = UserAccountMenuRoot;
