import * as React from "react";

import {
  COLLAPSED_READ_ONLY_LONGTEXT_LABEL,
  EXPANDED_READ_ONLY_LONGTEXT_LABEL,
  findCollapsedReadOnlyLongText,
} from "./readOnlyLongTextLogic";

export {
  COLLAPSED_READ_ONLY_LONGTEXT_LABEL,
  EXPANDED_READ_ONLY_LONGTEXT_LABEL,
  findCollapsedReadOnlyLongText,
  isReadOnlyLongTextVariable,
} from "./readOnlyLongTextLogic";
export type {
  FindCollapsedReadOnlyLongTextParams,
  FindCollapsedReadOnlyLongTextResult,
  ReadOnlyLongTextVariable,
} from "./readOnlyLongTextLogic";

export interface ReadOnlyLongTextProps {
  text: string;
  expandedText?: string;
  containerClassName?: string;
  textClassName?: string;
  buttonClassName?: string;
  maxLines?: number;
  renderText?: (text: string) => React.ReactNode;
  renderExpandedText?: (text: string) => React.ReactNode;
}

export function ReadOnlyLongText(props: ReadOnlyLongTextProps) {
  const {
    text,
    expandedText,
    containerClassName = "",
    textClassName = "",
    buttonClassName = "",
    maxLines = 2,
    renderText = (value) => value,
    renderExpandedText,
  } = props;
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const measureRef = React.useRef<HTMLDivElement | null>(null);
  const [availableWidth, setAvailableWidth] = React.useState(0);
  const [expanded, setExpanded] = React.useState(false);
  const [collapsedText, setCollapsedText] = React.useState(text);
  const [canCollapse, setCanCollapse] = React.useState(false);

  React.useEffect(() => {
    setExpanded(false);
  }, [text]);

  React.useEffect(() => {
    if (typeof window === "undefined" || !wrapperRef.current) {
      return;
    }

    const updateWidth = () => {
      setAvailableWidth(wrapperRef.current?.clientWidth ?? 0);
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(() => {
      updateWidth();
    });

    resizeObserver.observe(wrapperRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined" || !wrapperRef.current || !measureRef.current || availableWidth <= 0) {
      return;
    }

    const computedStyles = window.getComputedStyle(wrapperRef.current);
    const fontSize = Number.parseFloat(computedStyles.fontSize || "16");
    const lineHeight = Number.parseFloat(computedStyles.lineHeight || "") || fontSize * 1.5;
    const maxHeight = lineHeight * maxLines + 0.5;

    const fits = (candidate: string) => {
      if (!measureRef.current) {
        return true;
      }

      measureRef.current.textContent = candidate;
      return measureRef.current.getBoundingClientRect().height <= maxHeight;
    };

    const next = findCollapsedReadOnlyLongText({
      text,
      fits,
    });

    setCollapsedText(next.collapsedText);
    setCanCollapse(next.isCollapsed);
  }, [availableWidth, maxLines, text]);

  const collapsedPrefix = canCollapse
    ? collapsedText.slice(0, Math.max(0, collapsedText.length - COLLAPSED_READ_ONLY_LONGTEXT_LABEL.length))
    : text;
  const expandedValue = expandedText ?? text;
  const expandedContent = renderExpandedText ? renderExpandedText(expandedValue) : renderText(expandedValue);

  return (
    <div
      ref={wrapperRef}
      data-read-only-longtext="true"
      className={`relative ${containerClassName} ${textClassName}`.trim()}
    >
      {expanded || !canCollapse ? (
        <>
          {expandedContent}
          {canCollapse ? (
            <>
              {" "}
              <button
                type="button"
                className={buttonClassName}
                onClick={() => setExpanded(false)}
              >
                {EXPANDED_READ_ONLY_LONGTEXT_LABEL}
              </button>
            </>
          ) : null}
        </>
      ) : (
        <>
          {renderText(collapsedPrefix)}
          <button
            type="button"
            className={buttonClassName}
            onClick={() => setExpanded(true)}
          >
            {COLLAPSED_READ_ONLY_LONGTEXT_LABEL}
          </button>
        </>
      )}
      <div
        ref={measureRef}
        aria-hidden="true"
        className={`pointer-events-none absolute left-0 top-0 -z-10 whitespace-pre-wrap break-words opacity-0 ${textClassName}`.trim()}
        style={{ width: `${availableWidth}px` }}
      />
    </div>
  );
}
