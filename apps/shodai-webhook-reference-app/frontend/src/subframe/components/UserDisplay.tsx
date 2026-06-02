"use client";
/*
 * Documentation:
 * Avatar — https://app.subframe.com/345c49081508/library?component=Avatar_bec25ae6-5010-4485-b46b-cf79e3943ab2
 * Copy to clipboard button — https://app.subframe.com/345c49081508/library?component=Copy+to+clipboard+button_e8c76626-6462-4f2f-b595-38d530d427e8
 * UserDisplay — https://app.subframe.com/345c49081508/library?component=UserDisplay_22f37ed4-35bd-4797-9507-714f899cd2a0
 */

import React from "react";
import * as SubframeCore from "@subframe/core";
import * as SubframeUtils from "../utils";
import { Avatar } from "./Avatar";
import { CopyToClipboardButton } from "./CopyToClipboardButton";

interface UserDisplayRootProps extends React.HTMLAttributes<HTMLDivElement> {
  image?: string;
  name?: React.ReactNode;
  email?: React.ReactNode;
  walletAddress?: React.ReactNode;
  initials?: React.ReactNode;
  size?: "small" | "large";
  noBorder?: boolean;
  className?: string;
}

const UserDisplayRoot = React.forwardRef<HTMLDivElement, UserDisplayRootProps>(
  function UserDisplayRoot(
    {
      image,
      name,
      email,
      walletAddress,
      initials,
      size = "large",
      noBorder = false,
      className,
      ...otherProps
    }: UserDisplayRootProps,
    ref
  ) {
    return (
      <SubframeCore.HoverCard.Root>
        <SubframeCore.HoverCard.Trigger asChild={true}>
          <div
            className={SubframeUtils.twClassNames(
              "group/22f37ed4 flex cursor-pointer items-center gap-3 rounded-md border border-solid border-neutral-200 bg-default-background px-1 py-1 hover:shadow-sm",
              {
                "h-auto min-h-[24px] w-auto border-none bg-transparent px-0 py-0 hover:shadow-none":
                  noBorder,
                "h-6 w-auto max-w-[208px] flex-row flex-nowrap gap-1 px-1 py-1":
                  size === "small",
              },
              className
            )}
            ref={ref}
            {...otherProps}
          >
            <Avatar
              size={size === "small" ? "x-small" : undefined}
              image={image}
            >
              {initials}
            </Avatar>
            <div
              className={SubframeUtils.twClassNames(
                "flex flex-col items-start",
                { hidden: size === "small" }
              )}
            >
              {name ? (
                <span className="text-body-bold font-body-bold text-default-font">
                  {name}
                </span>
              ) : null}
              {email ? (
                <span className="text-caption font-caption text-subtext-color">
                  {email}
                </span>
              ) : null}
            </div>
            {name ? (
              <span
                className={SubframeUtils.twClassNames(
                  "hidden text-caption font-caption text-neutral-700",
                  {
                    "line-clamp-1 whitespace-normal break-normal text-body-bold font-body-bold flex":
                      size === "small",
                  }
                )}
              >
                {name}
              </span>
            ) : null}
          </div>
        </SubframeCore.HoverCard.Trigger>
        <SubframeCore.HoverCard.Portal>
          <SubframeCore.HoverCard.Content
            side="bottom"
            align="center"
            sideOffset={4}
            asChild={true}
          >
            <div className="flex h-48 w-64 flex-none flex-col items-start gap-3 rounded-md border border-solid border-neutral-border bg-default-background px-4 py-4 shadow-lg">
              <div className="flex w-full flex-col items-center gap-3">
                <Avatar size="large" image={image}>
                  {initials}
                </Avatar>
                {name ? (
                  <span className="text-heading-3 font-heading-3 text-default-font">
                    {name}
                  </span>
                ) : null}
              </div>
              <div className="flex w-full flex-col items-start gap-1">
                <div className="flex w-full items-center gap-1.5 rounded-md border border-solid border-neutral-border bg-neutral-50 pl-2 pr-0.5 py-0.5">
                  {email ? (
                    <span className="line-clamp-1 grow shrink-0 basis-0 whitespace-pre-wrap text-caption font-caption text-subtext-color">
                      {email}
                    </span>
                  ) : null}
                  <CopyToClipboardButton
                    clipboardText="sophia.vanknotsenburg@example.com"
                    tooltipText="Copy to clipboard"
                  />
                </div>
                <div className="flex w-full items-center gap-1.5 rounded-md border border-solid border-neutral-border bg-neutral-50 pl-2 pr-0.5 py-0.5">
                  {walletAddress ? (
                    <span className="grow shrink-0 basis-0 whitespace-pre-wrap text-caption font-caption text-subtext-color">
                      {walletAddress}
                    </span>
                  ) : null}
                  <CopyToClipboardButton
                    clipboardText="sophia.vanknotsenburg@example.com"
                    tooltipText="Copy to clipboard"
                  />
                </div>
              </div>
            </div>
          </SubframeCore.HoverCard.Content>
        </SubframeCore.HoverCard.Portal>
      </SubframeCore.HoverCard.Root>
    );
  }
);

export const UserDisplay = UserDisplayRoot;
