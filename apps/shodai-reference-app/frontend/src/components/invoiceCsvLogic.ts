export type InvoiceCsvRow = {
  /** Service date for the line (optional in UI; PDF falls back to invoice event timestamp if blank). */
  date: string;
  description: string;
  quantity: string;
  rate: string;
};

export type InvoiceCsvRowIssues = {
  description?: string;
  quantity?: string;
  rate?: string;
};

function escapeCsvValue(value: string): string {
  const trimmed = value.trim();
  if (!/[",\n\r]/.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/"/g, '""')}"`;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    throw new Error("Unterminated quoted value");
  }

  values.push(current.trim());
  return values;
}

function parseNumericValue(value: string): number | null {
  const normalized = value.replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isThreeColumnHeader(columns: string[]): boolean {
  return (
    columns.length === 3 &&
    columns[0].toLowerCase() === "description" &&
    columns[1].toLowerCase() === "quantity" &&
    columns[2].toLowerCase() === "rate"
  );
}

function isFourColumnHeader(columns: string[]): boolean {
  return (
    columns.length === 4 &&
    columns[0].toLowerCase() === "date" &&
    columns[1].toLowerCase() === "description" &&
    columns[2].toLowerCase() === "quantity" &&
    columns[3].toLowerCase() === "rate"
  );
}

export function isMeaningfulInvoiceCsvRow(row: InvoiceCsvRow): boolean {
  return [row.description, row.quantity, row.rate].some((value) => value.trim() !== "");
}

export function calculateInvoiceCsvRowAmount(row: InvoiceCsvRow): number | null {
  const quantity = parseNumericValue(row.quantity);
  const rate = parseNumericValue(row.rate);
  if (quantity == null || rate == null) return null;
  return quantity * rate;
}

export function calculateInvoiceCsvTotal(rows: InvoiceCsvRow[]): number {
  return rows.reduce((sum, row) => {
    const lineAmount = calculateInvoiceCsvRowAmount(row);
    return lineAmount == null ? sum : sum + lineAmount;
  }, 0);
}

export function getInvoiceCsvRowIssues(row: InvoiceCsvRow): InvoiceCsvRowIssues {
  if (!isMeaningfulInvoiceCsvRow(row)) return {};

  const issues: InvoiceCsvRowIssues = {};
  if (!row.description.trim()) issues.description = "Required";
  if (!row.quantity.trim()) issues.quantity = "Required";
  else if (parseNumericValue(row.quantity) == null) issues.quantity = "Enter a numeric quantity";
  if (!row.rate.trim()) issues.rate = "Required";
  else if (parseNumericValue(row.rate) == null) issues.rate = "Enter a numeric rate";
  return issues;
}

export function parseInvoiceCsvValue(value: string): InvoiceCsvRow[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const firstCols = parseCsvLine(lines[0]);
  let useDateColumn: boolean;
  let startIndex: number;

  if (isFourColumnHeader(firstCols)) {
    useDateColumn = true;
    startIndex = 1;
  } else if (isThreeColumnHeader(firstCols)) {
    useDateColumn = false;
    startIndex = 1;
  } else if (firstCols.length === 4) {
    useDateColumn = true;
    startIndex = 0;
  } else if (firstCols.length === 3) {
    useDateColumn = false;
    startIndex = 0;
  } else {
    throw new Error(
      "Expense lines must use 3 columns (description, quantity, rate) or 4 columns (date, description, quantity, rate), with optional header row",
    );
  }

  const rows: InvoiceCsvRow[] = [];

  for (let i = startIndex; i < lines.length; i += 1) {
    const columns = parseCsvLine(lines[i]);
    const rowNumber = rows.length + 1;

    if (useDateColumn) {
      if (columns.length !== 4) {
        throw new Error(`Expense line ${rowNumber} must contain date, description, quantity, and rate`);
      }
      rows.push({
        date: columns[0],
        description: columns[1],
        quantity: columns[2],
        rate: columns[3],
      });
    } else {
      if (columns.length !== 3) {
        throw new Error(`Expense line ${rowNumber} must contain description, quantity, and rate`);
      }
      rows.push({
        date: "",
        description: columns[0],
        quantity: columns[1],
        rate: columns[2],
      });
    }
  }

  return rows;
}

export function serializeInvoiceCsvValue(rows: InvoiceCsvRow[]): string {
  const meaningfulRows = rows.filter(isMeaningfulInvoiceCsvRow);
  if (meaningfulRows.length === 0) return "";

  return [
    "date,description,quantity,rate",
    ...meaningfulRows.map((row) =>
      [
        escapeCsvValue(row.date),
        escapeCsvValue(row.description),
        escapeCsvValue(row.quantity),
        escapeCsvValue(row.rate),
      ].join(","),
    ),
  ].join("\n");
}

export function validateInvoiceCsvValue(value: string, fieldLabel = "Expense lines"): true | string {
  if (!value.trim()) {
    return `${fieldLabel} is required`;
  }

  let rows: InvoiceCsvRow[];
  try {
    rows = parseInvoiceCsvValue(value);
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid invoice CSV";
  }

  if (rows.length === 0) {
    return `${fieldLabel} is required`;
  }

  for (const [index, row] of rows.entries()) {
    const issues = getInvoiceCsvRowIssues(row);
    if (issues.description || issues.quantity || issues.rate) {
      return `Expense line ${index + 1} must include description plus numeric quantity and rate`;
    }
  }

  return true;
}
