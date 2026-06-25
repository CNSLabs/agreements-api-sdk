import * as React from 'react';
import { TextField } from "@/subframe/components/TextField";
import { TextArea } from "@/subframe/components/TextArea";
import { DateTimePicker } from "@/components/DateTimePicker";
import type { DocumentVariable } from './VariableInput';
import { OnchainReferenceInput } from "@/components/OnchainReferenceInput";
import { isOnchainReferenceSubType } from "@/utils/onchainReferences";

export interface VariableFieldProps {
  fieldKey: string;
  variable: DocumentVariable;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string | { message?: string } | undefined;
  disabled?: boolean;
  showError?: boolean;
  className?: string;
  // Optional: convert dateTime values to datetime-local format
  convertDateTime?: (value: unknown) => string;
  // Optional: determine if field should use TextArea
  useTextArea?: boolean;
  // Optional: auto-focus this field
  autoFocus?: boolean;
}

/**
 * Shared component for rendering variable input fields.
 * Handles different variable types (dateTime, uint256, address, etc.)
 * and can render as TextField or TextArea based on props.
 */
export const VariableField: React.FC<VariableFieldProps> = ({
  fieldKey,
  variable,
  value,
  onChange,
  onBlur,
  error,
  disabled = false,
  showError = false,
  className = "h-auto w-full flex-none",
  convertDateTime,
  useTextArea = false,
  autoFocus = false,
}) => {
  const errorMessage = typeof error === 'string' ? error : error?.message;
  const isParticipantAddress =
    variable.type === "address" && String((variable as any)?.subType || "").toLowerCase() === "participant";
  const isCaip2Chain = variable.subType === "caip2Chain";
  const isCaip10Account = variable.subType === "caip10Account";
  const isCaip19Asset = variable.subType === "caip19Asset";

  const helpText = (
    <span className="flex flex-col gap-0.5">
      {variable.description ? <span>{variable.description}</span> : null}
      {isParticipantAddress ? (
        <span className="text-[11px] text-subtext-color">Participant address</span>
      ) : null}
      {isCaip2Chain ? (
        <span className="text-[11px] text-subtext-color">Select the chain for this value</span>
      ) : null}
      {isCaip10Account ? (
        <span className="text-[11px] text-subtext-color">Select a chain and enter the onchain account address</span>
      ) : null}
      {isCaip19Asset ? (
        <span className="text-[11px] text-subtext-color">Select a chain and enter the ERC-20 token contract address</span>
      ) : null}
      {showError && errorMessage ? <span className="text-red-600">{errorMessage}</span> : null}
    </span>
  );
  const displayValue = React.useMemo(() => {
    if (variable.type === 'dateTime' && convertDateTime) {
      return convertDateTime(value);
    }
    return value ?? '';
  }, [variable.type, value, convertDateTime]);

  const isNumericType = variable.type === "number" || variable.type === "uint256";
  const inputType = isNumericType ? "number" : "text";

  const placeholder =
    variable.subType === "caip2Chain"
      ? "eip155:100"
      : variable.subType === "caip10Account"
        ? "eip155:100:0x..."
        : variable.subType === "caip19Asset"
          ? "eip155:100/erc20:0x..."
          : variable.type === "address"
            ? "0x..."
            : "Enter value";

  if (useTextArea) {
    return (
      <TextArea
        key={fieldKey}
        className={className}
        error={showError && !!errorMessage}
        variant="outline"
        label={variable.name}
        helpText={helpText}
      >
        <TextArea.Input
          placeholder={placeholder}
          value={displayValue}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          autoFocus={autoFocus}
        />
      </TextArea>
    );
  }

  if (variable.type === "dateTime") {
    return (
      <DateTimePicker
        key={fieldKey}
        className={className}
        label={variable.name}
        helpText={helpText}
        error={showError && !!errorMessage}
        value={displayValue}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        placeholder="Select date and time"
      />
    );
  }

  if (isOnchainReferenceSubType(variable.subType)) {
    return (
      <OnchainReferenceInput
        className={className}
        variable={variable}
        value={displayValue}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        error={showError && !!errorMessage}
        label={variable.name}
        helpText={helpText}
        autoFocus={autoFocus}
      />
    );
  }

  return (
    <TextField
      key={fieldKey}
      className={className}
      label={variable.name}
      helpText={helpText}
      error={showError && !!errorMessage}
      disabled={disabled}
    >
      <TextField.Input
        type={inputType}
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
      />
    </TextField>
  );
};

export default VariableField;
