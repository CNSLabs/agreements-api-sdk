"use client";
/*
 * Documentation:
 * OAuth Social Button — https://app.subframe.com/345c49081508/library?component=OAuth+Social+Button_f1948f75-65f9-4f21-b3e4-a49511440c26
 */

import React from "react";
import * as SubframeUtils from "../utils";

interface OAuthSocialButtonRootProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  logo?: string;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

const OAuthSocialButtonRoot = React.forwardRef<
  HTMLButtonElement,
  OAuthSocialButtonRootProps
>(function OAuthSocialButtonRoot(
  {
    children,
    logo,
    disabled = false,
    className,
    type = "button",
    ...otherProps
  }: OAuthSocialButtonRootProps,
  ref
) {
  return (
    <button
      className={SubframeUtils.twClassNames(
        "group/f1948f75 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-none border border-solid border-neutral-border bg-default-background px-4 text-left hover:border-brand-primary hover:bg-neutral-100 active:bg-default-background disabled:cursor-default disabled:bg-neutral-200 hover:disabled:cursor-default hover:disabled:bg-neutral-200 active:disabled:cursor-default active:disabled:bg-neutral-200",
        className
      )}
      ref={ref}
      type={type}
      disabled={disabled}
      {...otherProps}
    >
      {logo ? (
        <img className="h-5 w-5 flex-none object-cover" src={logo} />
      ) : null}
      {children ? (
        <span className="text-body-bold font-body-bold text-default-font group-disabled/f1948f75:text-neutral-400">
          {children}
        </span>
      ) : null}
    </button>
  );
});

export const OAuthSocialButton = OAuthSocialButtonRoot;
