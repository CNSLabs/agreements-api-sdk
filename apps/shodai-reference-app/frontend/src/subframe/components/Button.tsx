"use client";
/*
 * Documentation:
 * Button — https://app.subframe.com/345c49081508/library?component=Button_3b777358-b86b-40af-9327-891efc6826fe
 */

import React from "react";
import * as SubframeCore from "@subframe/core";
import * as SubframeUtils from "../utils";

interface ButtonRootProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  disabled?: boolean;
  variant?:
    | "brand-primary"
    | "brand-secondary"
    | "brand-tertiary"
    | "neutral-primary"
    | "neutral-secondary"
    | "neutral-tertiary"
    | "destructive-primary"
    | "destructive-secondary"
    | "destructive-tertiary"
    | "inverse";
  size?: "large" | "medium" | "small";
  children?: React.ReactNode;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  loading?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

const ButtonRoot = React.forwardRef<HTMLButtonElement, ButtonRootProps>(
  function ButtonRoot(
    {
      disabled = false,
      variant = "brand-primary",
      size = "medium",
      children,
      icon = null,
      iconRight = null,
      loading = false,
      className,
      type = "button",
      ...otherProps
    }: ButtonRootProps,
    ref
  ) {
    return (
      <button
        className={SubframeUtils.twClassNames(
          "group/3b777358 flex h-8 cursor-pointer items-center justify-center gap-2 rounded-none border border-solid border-brand-primary bg-brand-primary px-3 text-left hover:border hover:border-solid hover:border-brand-primary hover:bg-default-background hover:shadow-none disabled:cursor-default disabled:border disabled:border-solid disabled:border-neutral-200 disabled:bg-neutral-200 hover:disabled:cursor-default hover:disabled:border hover:disabled:border-solid hover:disabled:border-neutral-200 hover:disabled:bg-neutral-200 active:disabled:cursor-default active:disabled:bg-neutral-200",
          {
            "h-6 w-auto flex-row flex-nowrap gap-1 px-2 py-0": size === "small",
            "h-10 w-auto px-4 py-0": size === "large",
            "border-none bg-transparent text-default-font hover:border-none hover:bg-neutral-100 hover:shadow-none active:bg-neutral-200":
              variant === "inverse",
            "border-none bg-transparent hover:border-none hover:bg-error-50 hover:shadow-none active:bg-error-100":
              variant === "destructive-tertiary",
            "border border-solid border-error-200 bg-transparent hover:border hover:border-solid hover:border-error-200 hover:bg-error-50 hover:shadow-none active:bg-error-100":
              variant === "destructive-secondary",
            "border-2 border-solid border-error-600 bg-error-600 hover:border-2 hover:border-solid hover:border-error-600 hover:bg-error-500 hover:shadow-none active:bg-error-700":
              variant === "destructive-primary",
            "border-none bg-transparent hover:border-none hover:bg-neutral-100 hover:shadow-none active:bg-neutral-200":
              variant === "neutral-tertiary",
            "border border-solid border-neutral-border bg-transparent hover:border hover:border-solid hover:border-brand-primary hover:bg-neutral-100 hover:shadow-none active:border active:border-solid active:border-neutral-300 active:bg-neutral-200":
              variant === "neutral-secondary",
            "border border-solid border-default-font bg-transparent hover:border hover:border-solid hover:border-default-font hover:bg-neutral-100 hover:shadow-none active:bg-neutral-200":
              variant === "neutral-primary",
            "border-none bg-transparent hover:bg-neutral-100 hover:shadow-none active:bg-neutral-200 active:shadow-none":
              variant === "brand-tertiary",
            "border border-solid border-brand-primary bg-transparent hover:bg-neutral-100 hover:shadow-none active:bg-neutral-200 active:shadow-none":
              variant === "brand-secondary",
          },
          className
        )}
        ref={ref}
        type={type}
        disabled={disabled}
        {...otherProps}
      >
        {icon ? (
          <SubframeCore.IconWrapper
            className={SubframeUtils.twClassNames(
              "text-body font-body text-default-background group-hover/3b777358:text-brand-700 group-disabled/3b777358:text-neutral-400",
              {
                hidden: loading,
                "text-body font-body": size === "small",
                "text-heading-3 font-heading-3": size === "large",
                "text-default-font": variant === "inverse",
                "text-error-700":
                  variant === "destructive-tertiary" ||
                  variant === "destructive-secondary",
                "text-neutral-700":
                  variant === "neutral-tertiary" ||
                  variant === "neutral-secondary" ||
                  variant === "neutral-primary",
                "text-brand-700":
                  variant === "brand-tertiary" || variant === "brand-secondary",
              }
            )}
          >
            {icon}
          </SubframeCore.IconWrapper>
        ) : null}
        <div
          className={SubframeUtils.twClassNames(
            "hidden h-4 w-4 flex-none items-center justify-center gap-2",
            { flex: loading, "h-3 w-3 flex-none": size === "small" }
          )}
        >
          <SubframeCore.Loader
            className={SubframeUtils.twClassNames(
              "text-caption font-caption text-default-background group-disabled/3b777358:text-neutral-400",
              {
                "inline-block font-['Inter'] text-[12px] font-[400] leading-[20px] tracking-normal":
                  loading,
                "text-caption font-caption": size === "small",
                "text-error-700":
                  variant === "destructive-tertiary" ||
                  variant === "destructive-secondary",
                "text-neutral-700":
                  variant === "neutral-tertiary" ||
                  variant === "neutral-secondary" ||
                  variant === "neutral-primary",
                "text-brand-700":
                  variant === "brand-tertiary" || variant === "brand-secondary",
              }
            )}
          />
        </div>
        {children ? (
          <span
            className={SubframeUtils.twClassNames(
              "whitespace-nowrap text-body font-body text-default-background group-hover/3b777358:text-brand-700 group-disabled/3b777358:text-neutral-400 group-hover/3b777358:group-disabled/3b777358:text-neutral-400",
              {
                hidden: loading,
                "text-caption-bold font-caption-bold": size === "small",
                "text-body-bold font-body-bold": size === "large",
                "text-default-font group-hover/3b777358:text-default-font":
                  variant === "inverse" || variant === "destructive-primary",
                "text-error-700":
                  variant === "destructive-tertiary" ||
                  variant === "destructive-secondary",
                "text-neutral-700":
                  variant === "neutral-tertiary" ||
                  variant === "neutral-secondary",
                "text-default-font": variant === "neutral-primary",
                "text-brand-700":
                  variant === "brand-tertiary" || variant === "brand-secondary",
              }
            )}
          >
            {children}
          </span>
        ) : null}
        {iconRight ? (
          <SubframeCore.IconWrapper
            className={SubframeUtils.twClassNames(
              "text-body font-body text-default-background group-hover/3b777358:text-brand-700 group-disabled/3b777358:text-neutral-400",
              {
                "text-body font-body": size === "small",
                "text-heading-3 font-heading-3": size === "large",
                "text-default-font": variant === "inverse",
                "text-error-700":
                  variant === "destructive-tertiary" ||
                  variant === "destructive-secondary",
                "text-neutral-700":
                  variant === "neutral-tertiary" ||
                  variant === "neutral-secondary" ||
                  variant === "neutral-primary",
                "text-brand-700":
                  variant === "brand-tertiary" || variant === "brand-secondary",
              }
            )}
          >
            {iconRight}
          </SubframeCore.IconWrapper>
        ) : null}
      </button>
    );
  }
);

export const Button = ButtonRoot;
