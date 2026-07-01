import type { AgreementNotificationTriggeredWebhookEvent } from '@cns-labs/agreements-api-client/webhooks';

export interface EmailAttachment {
  filename: string;
  contentType: string;
  contentBase64: string;
}

type LoggerLike = {
  warn(message: string): void;
};

type ReactPdfRendererModule = {
  Document: any;
  Page: any;
  Text: any;
  View: any;
  StyleSheet: {
    create: (styles: Record<string, unknown>) => Record<string, unknown>;
  };
  renderToBuffer: (document: unknown) => Promise<Buffer>;
};

type ReactModule = {
  createElement: (...args: any[]) => any;
};

type InvoiceLineItem = {
  date: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
};

type InvoiceSummaryRow = {
  label: string;
  value: string;
  tone: 'default' | 'plain';
};

type InvoiceSummary = {
  topRows: InvoiceSummaryRow[];
  bottomRows: InvoiceSummaryRow[];
  totalLabel: string;
  totalAmountDueFormatted: string;
  paymentInstructions: string[] | null;
};

type RetainerBalanceSnapshot = {
  chainId: number;
  retainerAddress: `0x${string}`;
  currencyAddress: `0x${string}`;
  tokenSymbol: string;
  tokenDecimals: number;
  currentBalance: number;
};

const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;

const CUSTOMER_INVOICE_VARIANTS = new Set([
  'invoice-v1',
  'final-invoice-v1',
  'manual-balance-invoice-v1',
  'manual-balance-final-invoice-v1',
]);

export async function resolveNotificationAttachments(params: {
  event: AgreementNotificationTriggeredWebhookEvent;
  localAgreementId: string;
  logger: LoggerLike;
}): Promise<EmailAttachment[]> {
  const { event, localAgreementId, logger } = params;
  const strategy = event.data.notification.attachmentStrategy;
  if (!strategy) return [];

  if (strategy.type !== 'customerInvoicePdf') {
    logger.warn(`Unsupported notification attachment strategy: ${String((strategy as any).type || '')}`);
    return [];
  }

  if (!CUSTOMER_INVOICE_VARIANTS.has(strategy.variant)) {
    return [invoiceDiagnosticAttachment(strategy.variant, `Unsupported customer invoice PDF variant: ${strategy.variant}`)];
  }

  try {
    return [await renderCustomerInvoicePdf({ event, localAgreementId, variant: strategy.variant })];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`Customer invoice PDF generation failed for webhook ${event.id}: ${message}`);
    return [invoiceDiagnosticAttachment(strategy.variant, message)];
  }
}

async function renderCustomerInvoicePdf(params: {
  event: AgreementNotificationTriggeredWebhookEvent;
  localAgreementId: string;
  variant: string;
}): Promise<EmailAttachment> {
  const { event, localAgreementId, variant } = params;
  const React = await dynamicImport('react') as ReactModule;
  const pdf = await dynamicImport('@react-pdf/renderer') as ReactPdfRendererModule;
  const styles = pdf.StyleSheet.create({
    page: {
      padding: 36,
      fontSize: 10,
      fontFamily: 'Helvetica',
      color: '#171717',
      backgroundColor: '#FFFFFF',
    },
    header: {
      marginBottom: 24,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#E5E5E5',
    },
    title: {
      fontSize: 22,
      marginBottom: 6,
      color: '#234B00',
    },
    subtitle: {
      fontSize: 10,
      color: '#737373',
    },
    section: {
      marginBottom: 18,
    },
    sectionTitle: {
      fontSize: 13,
      marginBottom: 8,
      color: '#326900',
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 5,
    },
    label: {
      color: '#737373',
      width: '35%',
    },
    value: {
      width: '65%',
      textAlign: 'right',
    },
    tableHeader: {
      flexDirection: 'row',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: '#E5E5E5',
      color: '#737373',
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: '#F0F0F0',
    },
    dateCell: { width: '20%' },
    descriptionCell: { width: '40%' },
    numberCell: { width: '13%', textAlign: 'right' },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 10,
      fontSize: 12,
    },
    summaryWrap: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 8,
    },
    summaryCard: {
      width: 300,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    summaryLabel: {
      color: '#737373',
    },
    summaryValue: {
      fontWeight: 700,
      textAlign: 'right',
    },
    summaryValuePlain: {
      textAlign: 'right',
    },
    summaryDivider: {
      borderTopWidth: 1,
      borderTopColor: '#E5E5E5',
      marginTop: 5,
      marginBottom: 8,
    },
    totalDivider: {
      borderTopWidth: 2,
      borderTopColor: '#171717',
      marginTop: 5,
      marginBottom: 8,
    },
    dueRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    dueLabel: {
      fontSize: 14,
      fontWeight: 700,
    },
    dueValue: {
      fontSize: 18,
      fontWeight: 700,
    },
    paymentInstructionsSection: {
      borderTopWidth: 1,
      borderTopColor: '#E5E5E5',
      marginTop: 16,
      paddingTop: 10,
    },
    paymentInstructionsHeading: {
      fontSize: 12,
      fontWeight: 700,
      marginBottom: 6,
    },
    paymentInstructionsLine: {
      fontSize: 10,
      marginBottom: 3,
    },
  });

  const variables = event.data.variables || {};
  const eventInput = event.data.transition?.inputId || '';
  const isFinalInvoice = variant.includes('final');
  const isManualBalanceVariant = variant.includes('manual-balance');
  const isInitialRetainerFunding = !isFinalInvoice && eventInput === '__deploy';
  const lineItems = isManualBalanceVariant && isInitialRetainerFunding
    ? buildInitialRetainerFundingLine(variables)
    : parseInvoiceLineItems(resolveInvoiceLineItemsValue(variables, eventInput, variant));
  const totalAmount = lineItems.reduce((sum, line) => sum + line.amount, 0);
  const invoiceNumber = stringValue(variables.invoiceNumber || variables.finalInvoiceNumber, event.data.ruleId);
  const invoiceDate = stringValue(variables.invoiceDate || variables.finalInvoiceDate, dateOnly(event.createdAt));
  const dueDate = stringValue(variables.invoiceDueDate || variables.finalInvoiceDueDate, '');
  const currency = stringValue(variables.tokenSymbol || variables.currencySymbol, 'USD');
  const agreementName = event.data.agreementName || stringValue(variables.agreementName, localAgreementId);
  const invoiceSummary = await buildInvoiceSummary({
    variables,
    eventInput,
    variant,
    lineItems,
    totalAmount,
    currency,
  });
  const filenameSuffix = isFinalInvoice ? 'final-invoice' : 'invoice';
  const filename = safeFilename(`${agreementName}-${invoiceNumber}-${filenameSuffix}.pdf`);

  const document = React.createElement(
    pdf.Document,
    null,
    React.createElement(
      pdf.Page,
      { size: 'LETTER', style: styles.page },
      React.createElement(
        pdf.View,
        { style: styles.header },
        React.createElement(pdf.Text, { style: styles.title }, variant.includes('final') ? 'Final Invoice' : 'Invoice'),
        React.createElement(pdf.Text, { style: styles.subtitle }, `Agreement ${localAgreementId}`),
      ),
      section(React, pdf, styles, 'Invoice Details', tupleRows([
        ['Agreement', agreementName],
        ['Invoice Number', invoiceNumber],
        ['Invoice Date', invoiceDate],
        ...(dueDate ? [['Due Date', dueDate] as [string, string]] : []),
        ['Notification Rule', event.data.ruleId],
      ])),
      section(React, pdf, styles, 'Parties', tupleRows([
        ['Service Provider', stringValue(variables.serviceProviderName || variables.vendorLegalName, 'Service Provider')],
        ['Client', stringValue(variables.clientName || variables.customerLegalName, 'Client')],
      ])),
      React.createElement(
        pdf.View,
        { style: styles.section },
        React.createElement(pdf.Text, { style: styles.sectionTitle }, 'Line Items'),
        React.createElement(
          pdf.View,
          { style: styles.tableHeader },
          React.createElement(pdf.Text, { style: styles.dateCell }, 'Date'),
          React.createElement(pdf.Text, { style: styles.descriptionCell }, 'Description'),
          React.createElement(pdf.Text, { style: styles.numberCell }, 'Qty'),
          React.createElement(pdf.Text, { style: styles.numberCell }, 'Rate'),
          React.createElement(pdf.Text, { style: styles.numberCell }, 'Amount'),
        ),
        ...lineItems.map((line) => React.createElement(
          pdf.View,
          { style: styles.tableRow, key: `${line.date}:${line.description}:${line.amount}` },
          React.createElement(pdf.Text, { style: styles.dateCell }, line.date || invoiceDate),
          React.createElement(pdf.Text, { style: styles.descriptionCell }, line.description),
          React.createElement(pdf.Text, { style: styles.numberCell }, formatNumber(line.quantity)),
          React.createElement(pdf.Text, { style: styles.numberCell }, formatMoney(line.rate, currency)),
          React.createElement(pdf.Text, { style: styles.numberCell }, formatMoney(line.amount, currency)),
        )),
        invoiceSummaryView(React, pdf, styles, invoiceSummary),
      ),
      section(React, pdf, styles, 'Retainer', tupleRows([
        ['Retainer Ceiling', stringValue(variables.retainerCeiling, '')],
        ['Retainer Floor', stringValue(variables.retainerFloor, '')],
        ['Retainer Address', stringValue(variables.retainerAddress, '')],
        ['Currency Address', stringValue(variables.currencyAddress, '')],
      ]).filter(([, value]) => Boolean(value))),
    ),
  );

  const rendered = await pdf.renderToBuffer(document);
  return {
    filename,
    contentType: 'application/pdf',
    contentBase64: Buffer.from(rendered).toString('base64'),
  };
}

function invoiceSummaryView(
  React: ReactModule,
  pdf: ReactPdfRendererModule,
  styles: Record<string, any>,
  summary: InvoiceSummary,
): unknown {
  return React.createElement(
    pdf.View,
    { style: styles.summaryWrap },
    React.createElement(
      pdf.View,
      { style: styles.summaryCard },
      ...summary.topRows.map((row, index) => summaryRowView(React, pdf, styles, row, `summary-top-${index}`)),
      React.createElement(pdf.View, { style: styles.summaryDivider }),
      ...summary.bottomRows.map((row, index) => summaryRowView(React, pdf, styles, row, `summary-bottom-${index}`)),
      React.createElement(pdf.View, { style: styles.totalDivider }),
      React.createElement(
        pdf.View,
        { style: styles.dueRow },
        React.createElement(pdf.Text, { style: styles.dueLabel }, summary.totalLabel),
        React.createElement(pdf.Text, { style: styles.dueValue }, summary.totalAmountDueFormatted),
      ),
      summary.paymentInstructions
        ? React.createElement(
            pdf.View,
            { style: styles.paymentInstructionsSection },
            React.createElement(pdf.Text, { style: styles.paymentInstructionsHeading }, 'Payment Instructions'),
            ...summary.paymentInstructions.map((line, index) =>
              React.createElement(
                pdf.Text,
                { key: `payment-instructions-${index}`, style: styles.paymentInstructionsLine },
                line,
              ),
            ),
          )
        : null,
    ),
  );
}

function summaryRowView(
  React: ReactModule,
  pdf: ReactPdfRendererModule,
  styles: Record<string, any>,
  row: InvoiceSummaryRow,
  key: string,
): unknown {
  return React.createElement(
    pdf.View,
    { style: styles.summaryRow, key },
    React.createElement(pdf.Text, { style: styles.summaryLabel }, row.label),
    React.createElement(
      pdf.Text,
      { style: row.tone === 'plain' ? styles.summaryValuePlain : styles.summaryValue },
      row.value,
    ),
  );
}

function section(
  React: ReactModule,
  pdf: ReactPdfRendererModule,
  styles: Record<string, any>,
  title: string,
  rows: Array<[string, string]>,
): unknown {
  if (rows.length === 0) return null;
  return React.createElement(
    pdf.View,
    { style: styles.section },
    React.createElement(pdf.Text, { style: styles.sectionTitle }, title),
    ...rows.map(([label, value]) => React.createElement(
      pdf.View,
      { style: styles.row, key: label },
      React.createElement(pdf.Text, { style: styles.label }, label),
      React.createElement(pdf.Text, { style: styles.value }, value),
    )),
  );
}

function tupleRows(rows: Array<[string, string]>): Array<[string, string]> {
  return rows;
}

async function buildInvoiceSummary(params: {
  variables: Record<string, unknown>;
  eventInput: string;
  variant: string;
  lineItems: InvoiceLineItem[];
  totalAmount: number;
  currency: string;
}): Promise<InvoiceSummary> {
  const { variables, eventInput, variant, lineItems, totalAmount, currency } = params;
  const isManualBalanceVariant = variant.includes('manual-balance');
  const isFinalInvoice = variant.includes('final');
  const isInitialRetainerFunding = !isFinalInvoice && eventInput === '__deploy';
  const retainerBalance = isManualBalanceVariant || isInitialRetainerFunding
    ? null
    : await loadOnChainRetainerBalance(variables, currency);
  const displayCurrency = retainerBalance?.tokenSymbol || currency;
  const formatAmount = isManualBalanceVariant
    ? (amount: number) => formatUsdMoney(amount)
    : (amount: number) => formatMoney(amount, displayCurrency);
  const currentBalance = isManualBalanceVariant || isInitialRetainerFunding
    ? (eventInput === '__deploy' ? 0 : requireNonNegativeAmount(variables.retainerBalanceBeforeInvoice, 'retainerBalanceBeforeInvoice'))
    : retainerBalance?.currentBalance ?? numberValue(variables.retainerBalanceBeforeInvoice ?? variables.retainerBalance ?? variables.currentRetainerBalance, 0);
  const retainerApplied = isInitialRetainerFunding ? 0 : Math.min(currentBalance, totalAmount);
  const remainingDue = totalAmount - retainerApplied;
  const remainingRetainer = currentBalance - retainerApplied;

  if (isFinalInvoice) {
    const customerRefund = remainingRetainer > 0 ? remainingRetainer : 0;
    const totalAmountDue = remainingDue - customerRefund;
    return {
      topRows: [
        { label: 'Final Invoice Total:', value: formatAmount(totalAmount), tone: 'default' },
        { label: 'Starting Retainer Balance:', value: formatAmount(currentBalance), tone: 'plain' },
        { label: 'Retainer Applied:', value: `-${formatAmount(retainerApplied)}`, tone: 'plain' },
        { label: 'Remaining Due:', value: formatAmount(remainingDue), tone: 'default' },
      ],
      bottomRows: [
        { label: 'Customer Refund:', value: formatAmount(customerRefund), tone: 'plain' },
        { label: 'Retainer Balance After Closeout:', value: formatAmount(0), tone: 'plain' },
      ],
      totalLabel: 'Net Amount Due:',
      totalAmountDueFormatted: formatAmount(totalAmountDue),
      paymentInstructions: isPaymentRequestingInvoice(eventInput) ? buildPaymentInstructions(variables, isManualBalanceVariant, displayCurrency, retainerBalance) : null,
    };
  }

  const retainerFloor = requireNonNegativeAmount(variables.retainerFloor, 'retainerFloor');
  const retainerCeiling = requireNonNegativeAmount(variables.retainerCeiling, 'retainerCeiling');
  if (retainerCeiling < retainerFloor) {
    throw new Error('"retainerCeiling" must be greater than or equal to "retainerFloor"');
  }
  const retainerRefresh = isInitialRetainerFunding
    ? 0
    : remainingRetainer < retainerFloor
      ? retainerCeiling - remainingRetainer
      : 0;
  const totalAmountDue = remainingDue + retainerRefresh;

  return {
    topRows: [
      { label: 'Current Invoice Total:', value: formatAmount(totalAmount), tone: 'default' },
      { label: 'Starting Retainer Balance:', value: formatAmount(currentBalance), tone: 'plain' },
      { label: 'Retainer Applied:', value: `-${formatAmount(retainerApplied)}`, tone: 'plain' },
      { label: 'Remaining Due:', value: formatAmount(remainingDue), tone: 'default' },
    ],
    bottomRows: [
      { label: 'Remaining Retainer:', value: formatAmount(remainingRetainer), tone: 'plain' },
      { label: 'Retainer Refresh:', value: formatAmount(retainerRefresh), tone: 'plain' },
    ],
    totalLabel: 'Total Amount Due:',
    totalAmountDueFormatted: formatAmount(totalAmountDue),
    paymentInstructions: isPaymentRequestingInvoice(eventInput) ? buildPaymentInstructions(variables, isManualBalanceVariant, displayCurrency, retainerBalance) : null,
  };
}

function parseInvoiceLineItems(value: unknown): InvoiceLineItem[] {
  if (Array.isArray(value)) {
    return value.map((line, index) => lineFromObject(line, index)).filter(Boolean) as ReturnType<typeof parseInvoiceLineItems>;
  }
  const raw = stringValue(value);
  if (!raw) return [lineFromObject({}, 0)];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index) => index > 0 || !/description|amount|quantity|rate/i.test(line))
    .map((line, index) => lineFromCsv(line, index));
}

function lineFromObject(value: unknown, index: number) {
  const record = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const quantity = numberValue(record.quantity, 1);
  const rate = numberValue(record.rate, numberValue(record.amount, 0));
  const amount = numberValue(record.amount, quantity * rate);
  return {
    date: stringValue(record.date || record.lineDate),
    description: stringValue(record.description, `Invoice line ${index + 1}`),
    quantity,
    rate,
    amount,
  };
}

function lineFromCsv(value: string, index: number) {
  const cells = value.split(',').map((cell) => cell.trim());
  const [date, description, quantity, rate, amount] = cells.length >= 5
    ? cells
    : ['', cells[0] || `Invoice line ${index + 1}`, cells[1] || '1', cells[2] || cells[1] || '0', cells[3] || cells[2] || cells[1] || '0'];
  return {
    date,
    description: description || `Invoice line ${index + 1}`,
    quantity: numberValue(quantity, 1),
    rate: numberValue(rate, numberValue(amount, 0)),
    amount: numberValue(amount, numberValue(quantity, 1) * numberValue(rate, 0)),
  };
}

function buildInitialRetainerFundingLine(variables: Record<string, unknown>): InvoiceLineItem[] {
  const retainerCeiling = requireNonNegativeAmount(variables.retainerCeiling, 'retainerCeiling');
  return [{
    date: '',
    description: 'Initial funding of retainer',
    quantity: 1,
    rate: retainerCeiling,
    amount: retainerCeiling,
  }];
}

function resolveInvoiceLineItemsValue(variables: Record<string, unknown>, eventInput: string, variant: string): unknown {
  if (variant.includes('final') || eventInput === 'finalInvoiceSubmit') {
    return variables.finalInvoiceLineItems ?? variables.invoiceLineItems ?? variables.expenseLinesCsv;
  }
  if (eventInput === 'submitInvoiceWithTopup') {
    return variables.topupInvoiceLineItems ?? variables.invoiceLineItems ?? variables.expenseLinesCsv;
  }
  return variables.invoiceLineItems ?? variables.expenseLinesCsv;
}

function isPaymentRequestingInvoice(eventInput: string): boolean {
  return eventInput === '__deploy' || eventInput === 'submitInvoiceWithTopup';
}

function buildPaymentInstructions(
  variables: Record<string, unknown>,
  isManualBalanceVariant: boolean,
  currency: string,
  retainerBalance: RetainerBalanceSnapshot | null,
): string[] | null {
  if (isManualBalanceVariant) {
    const rawValue = variables.paymentInstructions;
    if (typeof rawValue !== 'string' || !rawValue.trim()) return null;
    return rawValue.split(/\r?\n/).map((line) => line.replace(/\s+$/u, ''));
  }
  if (retainerBalance) {
    return [
      `To Address: ${retainerBalance.retainerAddress}`,
      `Accepted Currency: ${retainerBalance.tokenSymbol} (${shortenAddress(retainerBalance.currencyAddress)})`,
      `Supported Network: ${resolveChainDisplayName(retainerBalance.chainId)}`,
    ];
  }
  return [
    `To Address: ${stringValue(variables.retainerAddress || variables.retainerAccount, 'N/A')}`,
    `Accepted Currency: ${currency} (${stringValue(variables.currencyAddress || variables.paymentAsset, 'N/A')})`,
  ];
}

async function loadOnChainRetainerBalance(
  variables: Record<string, unknown>,
  invoiceCurrency: string,
): Promise<RetainerBalanceSnapshot> {
  const viem = await dynamicImport('viem') as any;
  const viemChains = await dynamicImport('viem/chains') as Record<string, unknown>;
  const retainerAccount = parseCaip10Account(variables.retainerAddress ?? variables.retainerAccount, 'retainerAddress');
  const paymentAsset = parseCaip19Erc20Asset(variables.currencyAddress ?? variables.paymentAsset, 'currencyAddress');
  if (retainerAccount.chainId !== paymentAsset.chainId) {
    throw new Error('Retainer account chain and payment asset chain must match');
  }
  const rpcUrl = resolveRpcUrl(retainerAccount.chainId, viemChains);
  if (!rpcUrl) {
    throw new Error(`No RPC URL available for chain ${retainerAccount.chainId}`);
  }
  const publicClient = viem.createPublicClient({ transport: viem.http(rpcUrl) });
  const abi = [
    {
      type: 'function',
      name: 'balanceOf',
      stateMutability: 'view',
      inputs: [{ name: 'account', type: 'address' }],
      outputs: [{ name: '', type: 'uint256' }],
    },
    {
      type: 'function',
      name: 'decimals',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'uint8' }],
    },
    {
      type: 'function',
      name: 'symbol',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ name: '', type: 'string' }],
    },
  ] as const;
  const [currentBalance, tokenDecimals, tokenSymbol] = await Promise.all([
    publicClient.readContract({
      address: paymentAsset.address,
      abi,
      functionName: 'balanceOf',
      args: [retainerAccount.address],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: paymentAsset.address,
      abi,
      functionName: 'decimals',
    }) as Promise<number>,
    publicClient.readContract({
      address: paymentAsset.address,
      abi,
      functionName: 'symbol',
    }).then((value: unknown) => stringValue(value, invoiceCurrency)).catch(() => invoiceCurrency),
  ]);
  return {
    chainId: retainerAccount.chainId,
    retainerAddress: retainerAccount.address,
    currencyAddress: paymentAsset.address,
    tokenSymbol: tokenSymbol || invoiceCurrency || 'TOKEN',
    tokenDecimals,
    currentBalance: Number(viem.formatUnits(currentBalance, tokenDecimals)),
  };
}

function parseCaip10Account(value: unknown, fieldName: string): { chainId: number; address: `0x${string}` } {
  const normalized = requireNonEmpty(value, fieldName);
  const match = normalized.match(/^(eip155:\d+):(0x[a-fA-F0-9]{40})$/);
  if (!match) throw new Error(`Missing or invalid CAIP-10 account for "${fieldName}"`);
  return {
    chainId: parseCaip2ChainId(match[1], fieldName),
    address: requireAddress(match[2], fieldName),
  };
}

function parseCaip19Erc20Asset(value: unknown, fieldName: string): { chainId: number; address: `0x${string}` } {
  const normalized = requireNonEmpty(value, fieldName);
  const match = normalized.match(/^(eip155:\d+)\/([a-z0-9-]{1,32}):(0x[a-fA-F0-9]{40})$/i);
  if (!match) throw new Error(`Missing or invalid CAIP-19 asset for "${fieldName}"`);
  if (match[2].toLowerCase() !== 'erc20') {
    throw new Error(`Unsupported asset namespace "${match[2]}" for "${fieldName}"`);
  }
  return {
    chainId: parseCaip2ChainId(match[1], fieldName),
    address: requireAddress(match[3], fieldName),
  };
}

function parseCaip2ChainId(value: unknown, fieldName: string): number {
  const normalized = requireNonEmpty(value, fieldName);
  const match = normalized.match(/^eip155:(\d+)$/i);
  if (!match) throw new Error(`Missing or invalid chain ID for "${fieldName}"`);
  const chainId = Number(match[1]);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Missing or invalid chain ID for "${fieldName}"`);
  }
  return chainId;
}

function requireAddress(value: unknown, fieldName: string): `0x${string}` {
  const normalized = requireNonEmpty(value, fieldName);
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    throw new Error(`Invalid address for "${fieldName}"`);
  }
  return normalized as `0x${string}`;
}

function requireNonEmpty(value: unknown, fieldName: string): string {
  const normalized = stringValue(value);
  if (!normalized) throw new Error(`Missing required invoice field "${fieldName}"`);
  return normalized;
}

function resolveRpcUrl(chainId: number, viemChains: Record<string, unknown>): string | undefined {
  const infuraProjectId = process.env.INFURA_PROJECT_ID;
  if (infuraProjectId) {
    if (chainId === 59144) return `https://linea-mainnet.infura.io/v3/${infuraProjectId}`;
    if (chainId === 59141) return `https://linea-sepolia.infura.io/v3/${infuraProjectId}`;
    if (chainId === 1) return `https://mainnet.infura.io/v3/${infuraProjectId}`;
    if (chainId === 11155111) return `https://sepolia.infura.io/v3/${infuraProjectId}`;
    if (chainId === 8453) return `https://base-mainnet.infura.io/v3/${infuraProjectId}`;
    if (chainId === 84532) return `https://base-sepolia.infura.io/v3/${infuraProjectId}`;
  }
  const knownChain = Object.values(viemChains).find((candidate: any) => candidate?.id === chainId) as any;
  return knownChain?.rpcUrls?.default?.http?.[0];
}

function shortenAddress(address: `0x${string}`): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function resolveChainDisplayName(chainId: number): string {
  if (chainId === 59141) return 'Linea Sepolia';
  if (chainId === 59144) return 'Linea';
  if (chainId === 84532) return 'Base Sepolia';
  if (chainId === 8453) return 'Base';
  if (chainId === 11155111) return 'Sepolia';
  if (chainId === 1) return 'Ethereum';
  return `Chain ${chainId}`;
}

function invoiceDiagnosticAttachment(variant: string, message: string): EmailAttachment {
  const body = [
    'Customer invoice PDF generation failed.',
    '',
    `Variant: ${variant || 'unknown'}`,
    `Reason: ${message}`,
  ].join('\n');
  return {
    filename: 'invoice-generation-failed.txt',
    contentType: 'text/plain; charset=utf-8',
    contentBase64: Buffer.from(body, 'utf8').toString('base64'),
  };
}

function stringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function numberValue(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireNonNegativeAmount(value: unknown, fieldName: string): number {
  const normalized = numberValue(value, NaN);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Missing or invalid non-negative amount for "${fieldName}"`);
  }
  return normalized;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}

function formatMoney(value: number, currency: string): string {
  return `${formatNumericValue(value)} ${currency}`;
}

function formatUsdMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatNumericValue(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function dateOnly(value: string): string {
  return String(value || '').slice(0, 10);
}

function safeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'invoice.pdf';
}
