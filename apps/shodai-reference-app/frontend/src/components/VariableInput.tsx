import * as React from 'react';
import { TextField } from "@/subframe/components/TextField";
import { TextArea } from "@/subframe/components/TextArea";
import { DateTimePicker } from "@/components/DateTimePicker";
import { isOnchainReferenceSubType } from "@/utils/onchainReferences";
import { OnchainReferenceInput } from "@/components/OnchainReferenceInput";

export interface DocumentVariable {
  type: 'string' | 'number' | 'uint256' | 'boolean' | 'bool' | 'address' | 'dateTime' | 'signature' | 'txHash';
  subType?: 'longText' | 'markdown' | 'participant' | 'signature' | 'caip2Chain' | 'caip10Account' | 'caip19Asset' | string;
  name: string;
  description?: string;
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

export interface VariableInputProps {
  name?: string;
  variable: DocumentVariable;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  error?: { message?: string } | string | undefined;
  disabled?: boolean;
  className?: string;
}

const VariableInput: React.FC<VariableInputProps> = ({
  name,
  variable,
  value,
  onChange,
  onBlur,
  error,
  disabled = false,
  className = "w-full",
}) => {
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(newValue);
  }, [onChange]);

  const errorMessage = typeof error === 'string' ? error : error?.message;
  const isMarkdown = variable.subType === 'markdown';
  const isLongText = variable.subType === 'longText';
  const useTextArea = isMarkdown || isLongText;
  const isNumericType = variable.type === 'number' || variable.type === 'uint256';
  const inputType = isNumericType ? 'number' : 'text';
  const placeholder =
    variable.subType === 'caip2Chain'
      ? 'eip155:100'
      : variable.subType === 'caip10Account'
        ? 'eip155:100:0x...'
        : variable.subType === 'caip19Asset'
          ? 'eip155:100/erc20:0x...'
          : variable.name;

  if (useTextArea) {
    return (
      <TextArea
        className={className}
        label={name || variable.name}
        helpText={variable.description}
        error={!!errorMessage}
        variant="outline"
      >
        <TextArea.Input
          value={localValue}
          onChange={(e) => {
            setLocalValue(e.target.value);
            onChange(e.target.value);
          }}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
        />
      </TextArea>
    );
  }

  if (isOnchainReferenceSubType(variable.subType)) {
    return (
      <OnchainReferenceInput
        className={className}
        variable={variable}
        value={localValue}
        onChange={(nextValue) => {
          setLocalValue(nextValue);
          onChange(nextValue);
        }}
        onBlur={onBlur}
        disabled={disabled}
        error={!!errorMessage}
        label={name || variable.name}
        helpText={variable.description}
      />
    );
  }

  if (variable.type === "dateTime") {
    return (
      <DateTimePicker
        className={className}
        label={name || variable.name}
        helpText={variable.description}
        error={!!errorMessage}
        value={localValue}
        onChange={(val) => {
          setLocalValue(val);
          onChange(val);
        }}
        onBlur={onBlur}
        disabled={disabled}
        placeholder={placeholder}
      />
    );
  }

  return (
    <TextField
      className={className}
      label={name || variable.name}
      helpText={variable.description}
      error={!!errorMessage}
      disabled={disabled}
    >
      <TextField.Input
        type={inputType}
        value={localValue}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
      />
    </TextField>
  );
};

export default VariableInput;
