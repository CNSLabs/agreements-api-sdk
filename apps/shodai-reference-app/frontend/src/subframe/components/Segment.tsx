// @subframe/sync-disable
// This has complex resize observer logic to determine if the segment should be icon only or not
// Thus syncing is disabled
"use client";
/*
 * Documentation:
 * Segment — https://app.subframe.com/345c49081508/library?component=Segment_7420840a-a613-42aa-9e62-c1318c68f84e
 */

import React from "react";
import * as SubframeCore from "@subframe/core";
import * as SubframeUtils from "../utils";

const SegmentIconOnlyContext = React.createContext<boolean>(false);

interface ItemProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  children?: React.ReactNode;
  active?: boolean;
  className?: string;
}

const Item = React.forwardRef<HTMLDivElement, ItemProps>(function Item(
  {
    icon = null,
    children,
    active = false,
    className,
    ...otherProps
  }: ItemProps,
  ref
) {
  const iconOnly = React.useContext(SegmentIconOnlyContext);

  return (
    <div
      className={SubframeUtils.twClassNames(
        "group/f16cefe2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md px-4 py-2 hover:bg-neutral-100",
        {
          "border border-solid border-brand-primary bg-default-background hover:bg-default-background":
            active,
        },
        className
      )}
      ref={ref}
      {...otherProps}
    >
      {icon ? (
        <SubframeCore.IconWrapper
          className={SubframeUtils.twClassNames(
            "text-body font-body text-subtext-color group-hover/f16cefe2:text-default-font",
            { "text-brand-700 group-hover/f16cefe2:text-brand-700": active }
          )}
        >
          {icon}
        </SubframeCore.IconWrapper>
      ) : null}
      {children ? (
        <span
          className={SubframeUtils.twClassNames(
            "whitespace-nowrap text-body-bold font-body-bold text-subtext-color",
            { hidden: iconOnly, "text-brand-700": active }
          )}
        >
          {children}
        </span>
      ) : null}
    </div>
  );
});

interface SegmentRootProps extends React.HTMLAttributes<HTMLDivElement> {
  items?: React.ReactNode;
  className?: string;
}

const SegmentRoot = React.forwardRef<HTMLDivElement, SegmentRootProps>(
  function SegmentRoot(
    { items, className, ...otherProps }: SegmentRootProps,
    ref
  ) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const iconOnlyRef = React.useRef(false);
    const naturalWidthRef = React.useRef<number>(0);
    const [iconOnly, setIconOnly] = React.useState(false);
    iconOnlyRef.current = iconOnly;

    const checkOverflowRef = React.useRef<() => void>(() => {});

    React.useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const checkOverflow = () => {
        const el = container;
        const hasOverflow = el.scrollWidth > el.clientWidth;
        const currentIconOnly = iconOnlyRef.current;

        if (currentIconOnly) {
          if (!hasOverflow && naturalWidthRef.current > 0) {
            if (el.clientWidth >= naturalWidthRef.current * 1.05) {
              setIconOnly(false);
            }
          }
        } else {
          if (hasOverflow) {
            naturalWidthRef.current = el.scrollWidth;
            setIconOnly(true);
          }
        }
      };
      checkOverflowRef.current = checkOverflow;

      const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(checkOverflow);
      });
      resizeObserver.observe(container);

      checkOverflow();

      return () => resizeObserver.disconnect();
    }, [items]);

    React.useEffect(() => {
      requestAnimationFrame(() => checkOverflowRef.current());
    }, [iconOnly]);

    return (
      <SegmentIconOnlyContext.Provider value={iconOnly}>
        {items ? (
          <div
            className={SubframeUtils.twClassNames(
              "flex w-full items-center gap-1 rounded-md bg-neutral-50 overflow-x-auto mobile:flex-row mobile:flex-nowrap mobile:gap-1",
              className
            )}
            ref={(el) => {
              (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              if (typeof ref === "function") ref(el);
              else if (ref) ref.current = el;
            }}
            {...otherProps}
          >
            {items}
          </div>
        ) : null}
      </SegmentIconOnlyContext.Provider>
    );
  }
);

export const Segment = Object.assign(SegmentRoot, {
  Item,
});
