import * as React from "react";
import type { AgreementInputRecordApi } from "@/hooks/useAgreementsApi";
import { getOnchainReferenceDetails } from "@/utils/onchainReferences";
import { AgreementValueContent } from "./AgreementValueContent";
import { getAgreementVariableRowPresentation } from "./agreementVariableRowPresentation";

function toDatetimeLocal(value: unknown): string {
  if (typeof value !== "string") return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function shortAddress(addr: string): string {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface DocumentVariable {
  type?: string;
  subType?: string;
  name?: string;
}

export interface AgreementActivityTabProps {
  activityInputs: AgreementInputRecordApi[];
  activityWithInit: AgreementInputRecordApi[];
  activityLoading: boolean;
  activityError: string | null;
  agreementJson: any;
  variables: Record<string, DocumentVariable>;
}

export function AgreementActivityTab({
  activityInputs,
  activityWithInit,
  activityLoading,
  activityError,
  agreementJson,
  variables,
}: AgreementActivityTabProps) {
  return (
    <div className="w-full">

      {activityError ? (
        <div className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {activityError}
        </div>
      ) : null}

      {activityLoading && activityInputs.length === 0 ? (
        <div className="w-full rounded-md border border-neutral-border bg-neutral-50 px-4 py-8 text-body font-body text-subtext-color">
          Loading activity…
        </div>
      ) : activityWithInit.length === 0 ? (
        <div className="w-full rounded-md border border-neutral-border bg-neutral-50 px-4 py-8 text-body font-body text-subtext-color">
          No activity yet.
        </div>
      ) : (
        <div className="flex w-full flex-col gap-3">
          {activityWithInit.map((inp) => {
            const isInit = inp.inputId === "__initialization__";
            const inputDef = isInit ? null : (agreementJson as any)?.execution?.inputs?.[inp.inputId];
            const title = isInit ? "Agreement Initialized" : (inputDef?.displayName || inp.inputId);
            const when = inp.createdAt ? new Date(inp.createdAt) : null;
            const whenLabel =
              when && !Number.isNaN(when.getTime()) ? when.toLocaleString() : (inp.createdAt ? String(inp.createdAt) : "");
            const txShort = inp.txHash ? `${inp.txHash.slice(0, 10)}…${inp.txHash.slice(-8)}` : "";
            const entries = Object.entries(inp.values || {});

            return (
              <div
                key={`${inp.txHash || ""}:${inp.inputId}:${inp.createdAt || ""}`}
                className="w-full rounded-md border border-neutral-border bg-default-background px-4 py-3 shadow-sm"
              >
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <div className="text-body-bold font-body-bold text-default-font">{String(title)}</div>
                    <div className="text-caption font-caption text-subtext-color">
                      {whenLabel ? whenLabel : null}
                      {inp.blockNumber ? ` · block ${inp.blockNumber}` : null}
                      {inp.status ? ` · ${String(inp.status)}` : null}
                    </div>
                  </div>
                  {txShort ? (
                    <div className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-mono text-subtext-color">
                      {txShort}
                    </div>
                  ) : null}
                </div>

                {entries.length ? (
                  <div className="mt-3 grid grid-cols-1 gap-2">
                    {entries.map(([k, v]) => {
                      const inlineField = inputDef?.data?.[k];
                      const fieldDef =
                        (variables as any)?.[k] ??
                        (typeof inlineField === "object" && inlineField !== null && !Array.isArray(inlineField)
                          ? inlineField
                          : null);
                      const label = fieldDef?.name || k;
                      const onchainDetails = getOnchainReferenceDetails(v, fieldDef);
                      const presentation = getAgreementVariableRowPresentation({
                        rawValue: v,
                        hasOnchainDetails: Boolean(onchainDetails),
                        variable: fieldDef,
                      });
                      const displayValue =
                        fieldDef?.type === "address" && typeof v === "string"
                          ? shortAddress(v)
                          : fieldDef?.type === "dateTime"
                            ? toDatetimeLocal(v)
                            : typeof v === "string" || typeof v === "number" || typeof v === "boolean"
                              ? String(v)
                                : v == null
                                  ? ""
                                  : JSON.stringify(v);

                      return (
                        <div
                          key={k}
                          className={`flex w-full ${
                            presentation.branch === "markdown" ? "flex-col" : "items-start justify-between"
                          } gap-3 rounded-md bg-neutral-50 px-3 py-2`}
                        >
                          <div className="text-caption-bold font-caption-bold text-default-font">{String(label)}</div>
                          <div
                            className={`min-w-0 ${
                              presentation.branch === "markdown" ? "w-full" : "max-w-[70%]"
                            } text-caption font-caption text-subtext-color break-words ${
                              presentation.branch === "markdown" || presentation.preserveWhitespace ? "text-left" : "text-right"
                            } ${presentation.preserveWhitespace ? "whitespace-pre-wrap" : ""}`}
                          >
                            <AgreementValueContent
                              rawValue={v}
                              displayValue={displayValue}
                              variable={fieldDef}
                              shellVariant="activity"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 text-caption font-caption text-subtext-color">No submitted variables.</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
