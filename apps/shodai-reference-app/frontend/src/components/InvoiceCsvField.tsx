import * as React from "react";
import { FeatherPlus, FeatherTrash2 } from "@subframe/core";
import { Button } from "@/subframe/components/Button";
import { IconButton } from "@/subframe/components/IconButton";
import { TextField } from "@/subframe/components/TextField";
import {
  calculateInvoiceCsvRowAmount,
  calculateInvoiceCsvTotal,
  getInvoiceCsvRowIssues,
  isMeaningfulInvoiceCsvRow,
  parseInvoiceCsvValue,
  serializeInvoiceCsvValue,
  type InvoiceCsvRow,
} from "./invoiceCsvLogic";

type InvoiceCsvEditorRow = InvoiceCsvRow & {
  id: string;
};

function createInvoiceCsvRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `invoice-csv-row-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEditorRow(row?: Partial<InvoiceCsvRow>): InvoiceCsvEditorRow {
  return {
    id: createInvoiceCsvRowId(),
    date: row?.date ?? "",
    description: row?.description ?? "",
    quantity: row?.quantity ?? "",
    rate: row?.rate ?? "",
  };
}

function stripEditorRowId(row: InvoiceCsvEditorRow): InvoiceCsvRow {
  return {
    date: row.date,
    description: row.description,
    quantity: row.quantity,
    rate: row.rate,
  };
}

function formatDisplayAmount(value: number | null): string {
  if (value == null) return "";
  return value.toFixed(2);
}

function buildEditorState(value: string): {
  rows: InvoiceCsvEditorRow[];
  parseError: string | null;
} {
  if (!value.trim()) {
    return {
      rows: [createEditorRow()],
      parseError: null,
    };
  }

  try {
    const parsedRows = parseInvoiceCsvValue(value);
    return {
      rows: parsedRows.length > 0 ? parsedRows.map((row) => createEditorRow(row)) : [createEditorRow()],
      parseError: null,
    };
  } catch (error) {
    return {
      rows: [createEditorRow()],
      parseError: error instanceof Error ? error.message : "Invalid invoice CSV",
    };
  }
}

export interface InvoiceCsvFieldProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
}

const invoiceCsvTableClass = "w-full table-fixed border-separate border-spacing-0";
const invoiceCsvTableResponsiveClass = "min-w-[42rem]";
const invoiceCsvHeaderCellClass =
  "border-b border-solid border-neutral-border bg-default-background px-3 py-2 text-left text-caption-bold font-caption-bold text-subtext-color";
const invoiceCsvBodyCellClass = "bg-neutral-50 px-1 py-2 align-top";
const invoiceCsvFooterCellClass =
  "border-t border-solid border-neutral-border bg-default-background px-3 py-2 text-body-bold font-body-bold text-default-font";
const invoiceCsvAmountCellClass = "bg-neutral-50 px-1 py-2 align-top";
const invoiceCsvActionCellClass = "pr-1 pl-0 align-top text-right";
const invoiceCsvInputFieldClass =
  "min-w-0 [&>div:first-child]:hidden [&>div:last-child]:px-1 [&>div:last-child>div]:px-0.5";
const invoiceCsvColumnWidths = {
  date: "18%",
  description: "30%",
  quantity: "12%",
  rate: "19.5%",
  amount: "16.5%",
  action: "4%",
} as const;

export function InvoiceCsvField({
  label,
  description,
  value,
  onChange,
  onBlur,
  error,
  disabled = false,
}: InvoiceCsvFieldProps) {
  const initialStateRef = React.useRef<ReturnType<typeof buildEditorState> | null>(null);
  if (!initialStateRef.current) {
    initialStateRef.current = buildEditorState(value ?? "");
  }

  const [rows, setRows] = React.useState<InvoiceCsvEditorRow[]>(initialStateRef.current.rows);
  const [parseError, setParseError] = React.useState<string | null>(
    initialStateRef.current.parseError,
  );
  const lastSerializedValueRef = React.useRef(value ?? "");

  React.useEffect(() => {
    const nextValue = value ?? "";
    if (nextValue === lastSerializedValueRef.current) return;

    const nextState = buildEditorState(nextValue);
    setRows(nextState.rows);
    setParseError(nextState.parseError);
    lastSerializedValueRef.current = nextValue;
  }, [value]);

  const syncRows = React.useCallback(
    (nextRows: InvoiceCsvEditorRow[]) => {
      const rowsToStore = nextRows.length > 0 ? nextRows : [createEditorRow()];
      setRows(rowsToStore);
      setParseError(null);

      const serializedValue = serializeInvoiceCsvValue(rowsToStore.map(stripEditorRowId));
      lastSerializedValueRef.current = serializedValue;
      onChange(serializedValue);
    },
    [onChange],
  );

  const rowIssues = React.useMemo(
    () => rows.map((row) => getInvoiceCsvRowIssues(stripEditorRowId(row))),
    [rows],
  );
  const totalAmount = React.useMemo(
    () => calculateInvoiceCsvTotal(rows.map(stripEditorRowId)),
    [rows],
  );

  const handleRowChange = React.useCallback(
    (rowId: string, field: keyof InvoiceCsvRow, nextValue: string) => {
      syncRows(
        rows.map((row) => (row.id === rowId ? { ...row, [field]: nextValue } : row)),
      );
    },
    [rows, syncRows],
  );

  const handleAddRow = React.useCallback(() => {
    syncRows([...rows, createEditorRow()]);
  }, [rows, syncRows]);

  const handleRemoveRow = React.useCallback(
    (rowId: string) => {
      syncRows(rows.filter((row) => row.id !== rowId));
    },
    [rows, syncRows],
  );

  const helpText = (
    <span className="flex flex-col gap-0.5">
      {description ? <span>{description}</span> : null}
      {/* <span className="text-[11px] text-subtext-color">
        Add one invoice line per row. The form submits a CSV string automatically.
      </span> */}
      {parseError ? <span className="text-red-600">{parseError}</span> : null}
      {error ? <span className="text-red-600">{error}</span> : null}
    </span>
  );

  return (
    <div className="flex w-full flex-col gap-3 rounded-md border border-solid border-neutral-border bg-default-background px-4 py-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <span className="text-caption-bold font-caption-bold text-default-font">{label}</span>
        {helpText}
      </div>

      <div className="overflow-x-auto rounded-md border border-solid border-neutral-border bg-neutral-50">
        <table className={`${invoiceCsvTableClass} ${invoiceCsvTableResponsiveClass}`}>
          <colgroup>
            <col style={{ width: invoiceCsvColumnWidths.date }} />
            <col style={{ width: invoiceCsvColumnWidths.description }} />
            <col style={{ width: invoiceCsvColumnWidths.quantity }} />
            <col style={{ width: invoiceCsvColumnWidths.rate }} />
            <col style={{ width: invoiceCsvColumnWidths.amount }} />
            <col style={{ width: invoiceCsvColumnWidths.action }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={invoiceCsvHeaderCellClass}>
                Date
              </th>
              <th scope="col" className={invoiceCsvHeaderCellClass}>
                Description
              </th>
              <th scope="col" className={invoiceCsvHeaderCellClass}>
                Qty
              </th>
              <th scope="col" className={invoiceCsvHeaderCellClass}>
                Rate
              </th>
              <th scope="col" className={`${invoiceCsvHeaderCellClass} text-right`}>
                Amount
              </th>
              <th scope="col" className={`${invoiceCsvHeaderCellClass} ${invoiceCsvActionCellClass}`}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const issues = rowIssues[index] || {};
              const showIssues = isMeaningfulInvoiceCsvRow(stripEditorRowId(row)) || !!error;
              const lineAmount = calculateInvoiceCsvRowAmount(stripEditorRowId(row));
              const rowDividerClass =
                index > 0 ? "border-t border-solid border-neutral-border" : "";

              return (
                <tr key={row.id}>
                  <td className={`${invoiceCsvBodyCellClass} ${rowDividerClass}`}>
                    <TextField
                      className={invoiceCsvInputFieldClass}
                      variant="outline"
                      disabled={disabled}
                    >
                      <input
                        className="group/b0d608f7 h-full w-full appearance-none border-none bg-transparent px-0 py-0 text-body font-body text-default-font outline-none placeholder:text-neutral-400 [&::-webkit-calendar-picker-indicator]:hidden"
                        aria-label={`Expense line ${index + 1} date`}
                        type="date"
                        value={row.date}
                        onChange={(event) => handleRowChange(row.id, "date", event.target.value)}
                        onClick={(event) => {
                          const input = event.currentTarget as HTMLInputElement & {
                            showPicker?: () => void;
                          };
                          input.showPicker?.();
                        }}
                        onBlur={onBlur}
                        disabled={disabled}
                      />
                    </TextField>
                  </td>
                  <td className={`${invoiceCsvBodyCellClass} ${rowDividerClass}`}>
                    <TextField
                      className={invoiceCsvInputFieldClass}
                      variant="outline"
                      error={showIssues && !!issues.description}
                      helpText={showIssues ? issues.description : undefined}
                      disabled={disabled}
                    >
                      <TextField.Input
                        aria-label={`Expense line ${index + 1} description`}
                        value={row.description}
                        onChange={(event) =>
                          handleRowChange(row.id, "description", event.target.value)
                        }
                        onBlur={onBlur}
                        placeholder="Description"
                        disabled={disabled}
                      />
                    </TextField>
                  </td>
                  <td className={`${invoiceCsvBodyCellClass} ${rowDividerClass}`}>
                    <TextField
                      className={invoiceCsvInputFieldClass}
                      variant="outline"
                      error={showIssues && !!issues.quantity}
                      helpText={showIssues ? issues.quantity : undefined}
                      disabled={disabled}
                    >
                      <TextField.Input
                        aria-label={`Expense line ${index + 1} quantity`}
                        type="number"
                        value={row.quantity}
                        onChange={(event) =>
                          handleRowChange(row.id, "quantity", event.target.value)
                        }
                        onBlur={onBlur}
                        placeholder="Qty"
                        disabled={disabled}
                        step="0.01"
                      />
                    </TextField>
                  </td>
                  <td className={`${invoiceCsvBodyCellClass} ${rowDividerClass}`}>
                    <TextField
                      className={invoiceCsvInputFieldClass}
                      variant="outline"
                      error={showIssues && !!issues.rate}
                      helpText={showIssues ? issues.rate : undefined}
                      disabled={disabled}
                    >
                      <TextField.Input
                        aria-label={`Expense line ${index + 1} rate`}
                        type="number"
                        value={row.rate}
                        onChange={(event) => handleRowChange(row.id, "rate", event.target.value)}
                        onBlur={onBlur}
                        placeholder="Rate"
                        disabled={disabled}
                        step="0.01"
                      />
                    </TextField>
                  </td>
                  <td className={`${invoiceCsvAmountCellClass} ${rowDividerClass}`}>
                    <div className="flex h-8 items-center justify-end rounded-md border border-solid border-neutral-border bg-neutral-100 px-2 text-body font-body text-default-font">
                      {formatDisplayAmount(lineAmount)}
                    </div>
                  </td>
                  <td className={`${invoiceCsvBodyCellClass} ${invoiceCsvActionCellClass} ${rowDividerClass}`}>
                    <IconButton
                      className="mt-1"
                      variant="destructive-tertiary"
                      size="small"
                      icon={<FeatherTrash2 />}
                      aria-label={`Delete expense line ${index + 1}`}
                      disabled={disabled || rows.length === 1}
                      onClick={() => handleRemoveRow(row.id)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className={invoiceCsvFooterCellClass} />
              <td className={invoiceCsvFooterCellClass} />
              <td className={invoiceCsvFooterCellClass} />
              <td className={`${invoiceCsvFooterCellClass} text-right`}>Total</td>
              <td className={`${invoiceCsvFooterCellClass} text-right`}>
                {formatDisplayAmount(totalAmount)}
              </td>
              <td className={`${invoiceCsvFooterCellClass} ${invoiceCsvActionCellClass}`} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div>
        <Button
          variant="neutral-secondary"
          size="small"
          icon={<FeatherPlus />}
          disabled={disabled}
          onClick={handleAddRow}
        >
          Add expense line
        </Button>
      </div>
    </div>
  );
}

export default InvoiceCsvField;
