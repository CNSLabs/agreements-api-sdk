import React, { useState, useRef, useEffect, useCallback } from "react";
import { Calendar } from "@/subframe/components/Calendar";
import { twClassNames } from "@/subframe/utils";

interface DateTimePickerProps {
  value?: string; // ISO format: "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD" when includeTime is false
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  label?: React.ReactNode;
  buttonAriaLabel?: string;
  helpText?: React.ReactNode;
  error?: boolean;
  className?: string;
  includeTime?: boolean;
  /** Earliest selectable month. Defaults to 100 years before today. */
  startMonth?: Date;
  /** Latest selectable month. Defaults to 50 years after today. */
  endMonth?: Date;
}

function parsePickerDate(value: string): Date | undefined {
  if (!value) return undefined;

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function formatDisplay(isoValue: string, includeTime: boolean): string {
  if (!isoValue) return "";
  const date = parsePickerDate(isoValue);
  if (!date) return isoValue;

  if (!includeTime) {
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const DateTimePicker = React.forwardRef<
  HTMLDivElement,
  DateTimePickerProps
>(function DateTimePicker(
  {
    value = "",
    onChange,
    onBlur,
    disabled = false,
    placeholder,
    label,
    buttonAriaLabel,
    helpText,
    error = false,
    className,
    includeTime = true,
    startMonth,
    endMonth,
  },
  ref
) {
  const now = new Date();
  const resolvedStartMonth =
    startMonth ?? new Date(now.getFullYear() - 100, 0);
  const resolvedEndMonth =
    endMonth ?? new Date(now.getFullYear() + 50, 11);

  const [open, setOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenAbove(spaceBelow < 400);
    }
  }, [open]);

  const validDate = parsePickerDate(value);
  const timeValue = value?.length >= 16 ? value.slice(11, 16) : "00:00";
  const resolvedPlaceholder =
    placeholder ?? (includeTime ? "Select date and time" : "Select date");

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        onBlur?.();
      }
    };
    if (open) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open, onBlur]);

  const handleDaySelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return;
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      onChange(includeTime ? `${dateStr}T${timeValue}` : dateStr);
    },
    [includeTime, onChange, timeValue]
  );

  const handleTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const time = e.target.value;
      const dateStr = value?.slice(0, 10) || new Date().toISOString().slice(0, 10);
      onChange(`${dateStr}T${time}`);
    },
    [onChange, value]
  );

  return (
    <div
      ref={(node) => {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current =
          node;
        if (typeof ref === "function") ref(node!);
        else if (ref)
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className={twClassNames(
        "group/datetimepicker relative flex flex-col items-start gap-1",
        className
      )}
    >
      {label ? (
        <span className="text-caption-bold font-caption-bold text-default-font">
          {label}
        </span>
      ) : null}

      <button
        type="button"
        aria-label={buttonAriaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={twClassNames(
          "flex h-8 w-full flex-none items-center rounded-md border border-solid border-neutral-border bg-default-background px-2 text-body font-body text-default-font text-left",
          {
            "border-brand-primary": open && !error && !disabled,
            "border-error-600": !!error,
            "border-neutral-200 bg-neutral-200 cursor-not-allowed": !!disabled,
            "text-neutral-400": !validDate,
          }
        )}
      >
        {validDate ? formatDisplay(value, includeTime) : resolvedPlaceholder}
      </button>

      {helpText ? (
        <span className="text-caption font-caption text-subtext-color">
          {helpText}
        </span>
      ) : null}

      {open ? (
        <div
          className={twClassNames(
            "absolute left-0 z-50 rounded-lg border border-solid border-neutral-200 bg-default-background p-3 shadow-lg",
            openAbove ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          <Calendar
            mode="single"
            selected={validDate}
            onSelect={handleDaySelect}
            captionLayout="dropdown"
            startMonth={resolvedStartMonth}
            endMonth={resolvedEndMonth}
            classNames={{
              caption_label: "sr-only",
              month_caption: "flex items-center justify-center h-8 px-9",
              dropdowns: "flex items-center gap-1",
              dropdown:
                "h-7 rounded border border-solid border-neutral-border bg-default-background px-1 text-body font-body text-default-font outline-none focus:border-brand-primary cursor-pointer",
            }}
          />
          {includeTime ? (
            <div className="mt-3 border-t border-solid border-neutral-100 pt-3 flex flex-col gap-1">
              <span className="text-caption-bold font-caption-bold text-subtext-color">
                Time
              </span>
              <div className="flex h-8 w-full flex-none items-center rounded-md border border-solid border-neutral-border bg-default-background px-2 focus-within:border-brand-primary">
                <input
                  type="time"
                  value={timeValue}
                  onChange={handleTimeChange}
                  className="h-full w-full border-none bg-transparent text-body font-body text-default-font outline-none accent-brand-primary"
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});
