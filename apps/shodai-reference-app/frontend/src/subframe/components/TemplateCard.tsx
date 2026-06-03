"use client";
/*
 * Documentation:
 * TemplateCard — https://app.subframe.com/345c49081508/library?component=TemplateCard_254ca1ff-a50b-4e52-a911-8e8211c7c2e2
 */

import React from "react";
import * as SubframeUtils from "../utils";

interface TemplateCardRootProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  image?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  tags?: React.ReactNode;
  className?: string;
}

const TemplateCardRoot = React.forwardRef<
  HTMLDivElement,
  TemplateCardRootProps
>(function TemplateCardRoot(
  {
    image,
    title,
    description,
    tags,
    className,
    ...otherProps
  }: TemplateCardRootProps,
  ref
) {
  return (
    <div
      className={SubframeUtils.twClassNames(
        "group/254ca1ff flex min-w-[240px] max-w-[320px] cursor-pointer flex-col items-start overflow-hidden rounded-lg border border-solid border-brand-primary bg-default-background hover:shadow-brand-glow",
        className
      )}
      ref={ref}
      {...otherProps}
    >
      <div className="flex w-full items-center justify-center bg-brand-50 px-2 py-4">
        {image ? (
          <img
            className="h-64 min-w-[0px] grow shrink-0 basis-0 rounded-md object-cover shadow-md"
            src={image}
          />
        ) : null}
      </div>
      <div className="flex w-full flex-col items-start gap-4 px-4 py-4">
        <div className="flex w-full flex-col items-start gap-1">
          {title ? (
            <span className="line-clamp-1 w-full text-heading-3 font-heading-3 text-default-font">
              {title}
            </span>
          ) : null}
          {description ? (
            <span className="line-clamp-1 w-full text-body font-body text-default-font">
              {description}
            </span>
          ) : null}
        </div>
        {tags ? (
          <div className="flex w-full flex-col items-start gap-2">{tags}</div>
        ) : null}
      </div>
    </div>
  );
});

export const TemplateCard = TemplateCardRoot;
