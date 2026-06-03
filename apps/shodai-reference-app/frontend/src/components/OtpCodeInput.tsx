import React, { useCallback, useEffect, useMemo, useRef } from "react";

export interface OtpCodeInputProps {
  value: string[];
  onChange: (nextValue: string[]) => void;
  length?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

const OtpCodeInput: React.FC<OtpCodeInputProps> = ({
  value,
  onChange,
  length = 6,
  disabled = false,
  autoFocus = true,
  className,
}) => {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const normalizedValue = useMemo(
    () => Array.from({ length }, (_, index) => value[index] ?? ""),
    [length, value],
  );

  const focusInput = useCallback(
    (index: number) => {
      if (index < 0 || index >= length) return;
      inputRefs.current[index]?.focus();
    },
    [length],
  );

  const updateValue = useCallback(
    (nextValue: string[]) => {
      onChange(nextValue.slice(0, length));
    },
    [length, onChange],
  );

  const fillFromIndex = useCallback(
    (startIndex: number, digits: string, clearExisting = false) => {
      const nextValue = clearExisting
        ? Array.from({ length }, () => "")
        : [...normalizedValue];
      let cursor = startIndex;

      for (const digit of digits) {
        if (cursor >= length) break;
        nextValue[cursor] = digit;
        cursor += 1;
      }

      updateValue(nextValue);
      return cursor;
    },
    [length, normalizedValue, updateValue],
  );

  const clearAt = useCallback(
    (index: number) => {
      const nextValue = [...normalizedValue];
      nextValue[index] = "";
      updateValue(nextValue);
    },
    [normalizedValue, updateValue],
  );

  useEffect(() => {
    if (!autoFocus || disabled) return;
    inputRefs.current[0]?.focus();
  }, [autoFocus, disabled]);

  const applyPastedDigits = useCallback(
    (startIndex: number, rawValue: string) => {
      const digits = onlyDigits(rawValue);
      if (!digits) return false;

      const clampedStart = Math.max(0, Math.min(startIndex, length - 1));
      const shouldFillFromStart = clampedStart === 0 || digits.length >= length;
      const nextCursor = fillFromIndex(
        shouldFillFromStart ? 0 : clampedStart,
        digits,
        shouldFillFromStart,
      );
      focusInput(Math.min(nextCursor, length - 1));
      return true;
    },
    [fillFromIndex, focusInput, length],
  );

  const handleChange = useCallback(
    (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
      const digits = onlyDigits(event.target.value);

      if (!digits) {
        clearAt(index);
        return;
      }

      if (digits.length === 1) {
        const nextValue = [...normalizedValue];
        nextValue[index] = digits;
        updateValue(nextValue);
        if (index < length - 1) {
          focusInput(index + 1);
        }
        return;
      }

      const nextCursor = fillFromIndex(index, digits);
      focusInput(Math.min(nextCursor, length - 1));
    },
    [clearAt, fillFromIndex, focusInput, length, normalizedValue, updateValue],
  );

  const handlePaste = useCallback(
    (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
      const pasted = event.clipboardData.getData("text");
      if (!applyPastedDigits(index, pasted)) return;
      event.preventDefault();
    },
    [applyPastedDigits],
  );

  const handleKeyDown = useCallback(
    (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
      // Allow standard clipboard/navigation shortcuts (Cmd/Ctrl + key).
      if (event.metaKey || event.ctrlKey) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusInput(index - 1);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusInput(index + 1);
        return;
      }

      if (event.key === "Delete") {
        event.preventDefault();
        clearAt(index);
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        if (normalizedValue[index]) {
          clearAt(index);
          return;
        }

        if (index > 0) {
          clearAt(index - 1);
          focusInput(index - 1);
        }
        return;
      }

      if (event.key.length === 1 && /\D/.test(event.key)) {
        event.preventDefault();
      }
    },
    [clearAt, focusInput, normalizedValue],
  );

  return (
    <div
      className={className ?? "flex items-center justify-center gap-2"}
      onPaste={(event: React.ClipboardEvent<HTMLDivElement>) => {
        const activeElement = document.activeElement as HTMLInputElement | null;
        const focusedIndex = Number(activeElement?.dataset?.otpIndex ?? "0");
        if (Number.isNaN(focusedIndex)) return;

        const pasted = event.clipboardData.getData("text");
        if (!applyPastedDigits(Math.max(0, focusedIndex), pasted)) return;
        event.preventDefault();
      }}
    >
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          className="h-10 w-10 rounded-md border border-solid border-neutral-border bg-white text-center text-body-bold font-body-bold text-default-font outline-none focus:border-brand-500"
          data-otp-index={index}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={length}
          aria-label={`Verification code digit ${index + 1}`}
          value={normalizedValue[index]}
          disabled={disabled}
          onFocus={(event: React.FocusEvent<HTMLInputElement>) => {
            event.currentTarget.select();
          }}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
            handleChange(index, event);
          }}
          onPaste={(event: React.ClipboardEvent<HTMLInputElement>) => {
            handlePaste(index, event);
          }}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            handleKeyDown(index, event);
          }}
        />
      ))}
    </div>
  );
};

export default OtpCodeInput;
