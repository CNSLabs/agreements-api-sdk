import * as React from "react";
import { TextField } from "@/subframe/components/TextField";
import { Select } from "@/subframe/components/Select";
import {
  EIP155_CHAIN_OPTIONS,
  buildCaip10Account,
  buildCaip19Asset,
  buildCaip2Chain,
  decomposeOnchainReferenceValue,
  type OnchainReferenceVariable,
} from "@/utils/onchainReferences";

interface OnchainReferenceInputProps {
  variable: OnchainReferenceVariable;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  error?: boolean;
  label?: string;
  helpText?: React.ReactNode;
  className?: string;
  autoFocus?: boolean;
}

export function OnchainReferenceInput({
  variable,
  value,
  onChange,
  onBlur,
  disabled = false,
  error = false,
  label,
  helpText,
  className = "w-full",
  autoFocus = false,
}: OnchainReferenceInputProps) {
  const [{ chainReference, address, assetNamespace }, setParts] = React.useState(() =>
    decomposeOnchainReferenceValue(value, variable.subType)
  );

  React.useEffect(() => {
    setParts(decomposeOnchainReferenceValue(value, variable.subType));
  }, [value, variable.subType]);

  const emitValue = React.useCallback(
    (next: { chainReference?: string; address?: string; assetNamespace?: string }) => {
      const resolved = {
        chainReference: next.chainReference ?? chainReference,
        address: next.address ?? address,
        assetNamespace: next.assetNamespace ?? assetNamespace,
      };

      let nextValue = "";
      if (variable.subType === "caip2Chain") {
        nextValue = buildCaip2Chain(resolved.chainReference);
      } else if (variable.subType === "caip10Account") {
        nextValue = buildCaip10Account(resolved.chainReference, resolved.address);
      } else if (variable.subType === "caip19Asset") {
        nextValue = buildCaip19Asset(resolved.chainReference, resolved.address, resolved.assetNamespace);
      }

      setParts(resolved);
      onChange(nextValue);
    },
    [address, assetNamespace, chainReference, onChange, variable.subType]
  );

  const addressLabel = variable.subType === "caip19Asset" ? "Token Contract Address" : "Address";
  const addressPlaceholder = variable.subType === "caip19Asset" ? "0x token contract" : "0x account address";
  const shellLabel = label || variable.name || "Onchain Reference";

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <span className="text-caption-bold font-caption-bold text-default-font">{shellLabel}</span>
      <div className="grid grid-cols-[minmax(180px,220px)_1fr] gap-3 mobile:grid-cols-1">
        <Select
          label="Chain"
          variant="outline"
          value={chainReference}
          onValueChange={(nextValue) => emitValue({ chainReference: nextValue })}
          onOpenChange={(open) => {
            if (!open) onBlur?.();
          }}
          disabled={disabled}
          error={error}
          placeholder="Select chain"
        >
          {EIP155_CHAIN_OPTIONS.map((option) => (
            <Select.Item key={option.caip2} value={option.reference}>
              {option.chainName}
            </Select.Item>
          ))}
        </Select>
        {variable.subType !== "caip2Chain" ? (
          <TextField
            label={addressLabel}
            variant="outline"
            error={error}
            disabled={disabled}
          >
            <TextField.Input
              value={address}
              onChange={(event) => emitValue({ address: event.target.value })}
              onBlur={onBlur}
              placeholder={addressPlaceholder}
              disabled={disabled}
              autoFocus={autoFocus}
            />
          </TextField>
        ) : null}
      </div>
      {helpText ? <div className="text-caption font-caption text-subtext-color">{helpText}</div> : null}
    </div>
  );
}
