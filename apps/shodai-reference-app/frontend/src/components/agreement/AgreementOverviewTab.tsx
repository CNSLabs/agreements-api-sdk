import * as React from "react";
import { isAddress } from "viem";
import { Button } from "@/subframe/components/Button";
import { Avatar } from "@/subframe/components/Avatar";
import { DisplayCard } from "@/subframe/components/DisplayCard";
import { IconButton } from "@/subframe/components/IconButton";
import { Table } from "@/subframe/components/Table";
import { Tooltip } from "@/subframe/components/Tooltip";
import { Badge } from "@/subframe/components/Badge";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { AgreementVariableRow } from "./AgreementVariableRow";
import { getInitializationVariableEntries } from "./initializationVariables";
import { templateThumbUrl } from "@/utils/templateAssets";
import { extractIssuerVariableKeys } from "@/utils/agreementsUi";
import type { ParticipantApi, AgreementRecordApi } from "@/hooks/useAgreementsApi";
import type { AgreementInputRecordApi } from "@/hooks/useAgreementsApi";
import * as SubframeCore from "@subframe/core";
import {
  FeatherActivity,
  FeatherAlertCircle,
  FeatherChevronRight,
  FeatherCircleDot,
  FeatherCopy,
  FeatherDownloadCloud,
  FeatherExternalLink,
  FeatherEye,
  FeatherFileInput,
  FeatherFileText,
  FeatherStepBack,
  FeatherUsers,
  FeatherWorkflow,
} from "@subframe/core";
import StateMachineFlowViewer from "@/components/StateMachineFlowViewer";

function shortAddress(addr: string): string {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export type AgreementTabId = "overview" | "actions" | "document" | "stateMachine" | "activity";

interface DocumentVariable {
  type?: string;
  subType?: string;
  name?: string;
}

export interface AgreementOverviewTabProps {
  record: AgreementRecordApi | null;
  agreementJson: any;
  currentState: string | null;
  stateLabel: string;
  agreementAddress: string;
  blockExplorerUrl: string;
  agreementTemplateId: string | null;
  chainName: string | undefined;
  displayParticipants: ParticipantApi[];
  variables: Record<string, DocumentVariable>;
  performableInputIds: string[];
  canSubmitAnyAvailableInput: boolean;
  activityInputs: AgreementInputRecordApi[];
  activityWithInit: AgreementInputRecordApi[];
  activityLoading: boolean;
  previousStateLabel: string | null;
  canReviewPreviousInput: boolean;
  documentThumbFailed: boolean;
  documentPreviewMarkdown: string;
  connectedAddress: string | undefined;
  onSetTab: (tab: AgreementTabId) => void;
  onOpenActions: () => void;
  onReviewPreviousInput: () => void;
  onDocumentPdfOrPrint: () => void;
  onCopyContract: () => void;
  onDocumentThumbError: () => void;
}

export function AgreementOverviewTab({
  record,
  agreementJson,
  currentState,
  stateLabel,
  agreementAddress,
  blockExplorerUrl,
  agreementTemplateId,
  chainName,
  displayParticipants,
  variables,
  performableInputIds,
  canSubmitAnyAvailableInput,
  activityInputs,
  activityWithInit,
  activityLoading,
  previousStateLabel,
  canReviewPreviousInput,
  documentThumbFailed,
  documentPreviewMarkdown,
  connectedAddress,
  onSetTab,
  onOpenActions,
  onReviewPreviousInput,
  onDocumentPdfOrPrint,
  onCopyContract,
  onDocumentThumbError,
}: AgreementOverviewTabProps) {
  const [agreementDetailsView, setAgreementDetailsView] = React.useState<"overview" | "variables">("overview");
  const initializationVariableEntries = React.useMemo(() => {
    return getInitializationVariableEntries({
      initializeData: (record?.json as any)?.execution?.initialize?.data,
      recordVariables: (record?.variables as Record<string, unknown> | undefined) ?? {},
      variables,
    });
  }, [record?.json, record?.variables, variables]);

  return (
    <div className="w-full max-w-[1280px] flex flex-col gap-6">
      {performableInputIds.length > 0 && canSubmitAnyAvailableInput ? (
        <div className="flex w-full items-center gap-4 rounded-md border border-solid border-brand-primary bg-brand-50 px-6 py-4 shadow-sm mobile:flex-col mobile:items-start mobile:gap-3 mobile:px-4 mobile:py-4">
          <FeatherAlertCircle className="text-heading-2 font-heading-2 text-brand-600" />
          <div className="flex grow shrink-0 basis-0 flex-col items-start gap-1 mobile:gap-2">
            <span className="text-body-bold font-body-bold text-default-font">
              Action(s) Available for {stateLabel}
            </span>
            <span className="text-caption font-caption text-subtext-color mobile:line-clamp-2 mobile:whitespace-normal mobile:break-normal">
              The current step has available actions for you to take. Your review may be needed to progress.
            </span>
          </div>
          <div className="flex items-center gap-2 mobile:w-full mobile:flex-col mobile:items-stretch">
            {canReviewPreviousInput ? (
              <Button variant="neutral-secondary" size="medium" onClick={onReviewPreviousInput}>
                Review Previous Input
              </Button>
            ) : null}
            <Button variant="brand-primary" size="medium" iconRight={<FeatherChevronRight />} onClick={onOpenActions}>
              Act Now
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex w-full items-start justify-center gap-6 mobile:flex-col mobile:items-center">
        <div className="flex grow shrink-0 basis-0 flex-col items-start gap-6 mobile:w-full">
          <DisplayCard
            title="Agreement Details"
            headActions={
              <div className="flex items-center gap-1 rounded-md border border-solid border-neutral-border bg-neutral-50 p-0.5">
                <Button
                  variant={agreementDetailsView === "overview" ? "brand-secondary" : "neutral-tertiary"}
                  size="small"
                  onClick={() => setAgreementDetailsView("overview")}
                >
                  Overview
                </Button>
                <Button
                  variant={agreementDetailsView === "variables" ? "brand-secondary" : "neutral-tertiary"}
                  size="small"
                  onClick={() => setAgreementDetailsView("variables")}
                >
                  Variables
                </Button>
              </div>
            }
            divider
            content={
            agreementDetailsView === "overview" ? (
              <div className="flex w-full flex-col items-start gap-4 px-4 py-4">
                <div className="flex w-full items-start justify-between">
                  <span className="text-body font-body text-subtext-color">Template Name</span>
                  <span className="text-body-bold font-body-bold text-default-font">
                    {(agreementJson as any)?.metadata?.name || "—"}
                  </span>
                </div>
                <div className="flex w-full items-start justify-between">
                  <span className="text-body font-body text-subtext-color">Template Created</span>
                  <span className="text-body-bold font-body-bold text-default-font">
                    {agreementJson?.metadata?.createdAt ? new Date(agreementJson?.metadata?.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}
                  </span>
                </div>
                <div className="flex w-full items-start justify-between">
                  <span className="text-body font-body text-subtext-color">Created By</span>
                  <div className="flex items-center gap-1">
                    <Avatar size="x-small">
                      {(agreementJson?.metadata?.author?.[0] || "U").toUpperCase()}
                    </Avatar>
                    <span className="text-body-bold font-body-bold text-default-font">
                      {agreementJson?.metadata?.author || "—"}
                    </span>
                  </div>
                </div>
                <div className="flex w-full items-start justify-between">
                  <span className="text-body font-body text-subtext-color">Deployed</span>
                  <span className="text-body-bold font-body-bold text-default-font">
                    {record?.updatedAt ? new Date(record.updatedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"}
                  </span>
                </div>
                <div className="flex w-full items-start justify-between">
                  <span className="text-body font-body text-subtext-color">Deployed By</span>
                  <span className="text-body-bold font-body-bold text-default-font">
                    {connectedAddress ? shortAddress(connectedAddress) : "—"}
                  </span>
                </div>
                <div className="flex w-full items-start justify-between">
                  <span className="text-body font-body text-subtext-color">Network</span>
                  <div className="flex items-center gap-1">
                    <Avatar size="x-small">
                      {chainName?.[0] || "N"}
                    </Avatar>
                    <span className="text-body-bold font-body-bold text-default-font">
                      {chainName || (agreementJson as any)?.metadata?.network || "—"}
                    </span>
                  </div>
                </div>
                <div className="flex w-full items-start justify-between gap-6">
                  <span className="text-body font-body text-subtext-color">Contract</span>
                  <div className="flex items-center gap-1">
                    <span className="text-caption font-caption text-default-font">{shortAddress(agreementAddress)}</span>
                    <IconButton size="small" icon={<FeatherCopy />} onClick={onCopyContract} />
                    <IconButton
                      size="small"
                      icon={<FeatherExternalLink />}
                      onClick={() => {
                        try {
                          window.open(`${blockExplorerUrl}/address/${agreementAddress}`, "_blank");
                        } catch (e) {
                          console.error("Failed to open block explorer:", e);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex w-full flex-col items-start gap-4 px-4 py-4">
                {initializationVariableEntries.length === 0 ? (
                  <div className="w-full rounded-md bg-neutral-50 px-3 py-3 text-caption font-caption text-subtext-color">
                    No initialization variables available.
                  </div>
                ) : (
                  <div className="flex w-full flex-col items-start gap-px rounded-md border border-solid border-neutral-border bg-neutral-border">
                    {initializationVariableEntries.map(([key, value, variable]) => (
                      <AgreementVariableRow key={key} label={variable?.name || key} value={value} variable={variable} />
                    ))}
                  </div>
                )}
              </div>
            )
            }
          />

          <DisplayCard
            icon={<FeatherUsers />}
            title="Participants"
            divider
            content={
              displayParticipants.length > 0 ? (
              <div className="flex w-full flex-col items-start border-t border-solid border-neutral-border pt-0.5">
                <Table
                  header={
                    <Table.HeaderRow>
                      <Table.HeaderCell />
                      <Table.HeaderCell>Roles</Table.HeaderCell>
                      <Table.HeaderCell>Wallet</Table.HeaderCell>
                      <Table.HeaderCell>Viewed</Table.HeaderCell>
                      <Table.HeaderCell />
                    </Table.HeaderRow>
                  }
                >
                  {displayParticipants.map((participant, idx) => {
                    const fullName = [participant.firstName, participant.lastName].filter(Boolean).join(" ");
                    const email = participant.email || "";
                    const initial = (fullName?.[0] || email?.[0] || participant.variableKey?.[0] || "P").toUpperCase();
                    const variableDef = participant.variableKey ? variables[participant.variableKey] : null;
                    const roleName = variableDef?.name || participant.variableKey || "Participant";
                    const walletFromVars = participant.variableKey && record?.variables
                      ? (record.variables as Record<string, unknown>)[participant.variableKey]
                      : undefined;
                    const walletAddr = (participant.walletAddress || (typeof walletFromVars === "string" && isAddress(walletFromVars) ? walletFromVars : "")) || "";
                    return (
                      <Table.Row key={participant.variableKey || idx}>
                        <Table.Cell>
                          <div className="flex items-center gap-2">
                            <Avatar>{initial}</Avatar>
                            <div className="flex flex-col items-start">
                              <span className="line-clamp-1 text-body-bold font-body-bold text-default-font">
                                {fullName || roleName}
                              </span>
                              {email && (
                                <span className="text-caption font-caption text-subtext-color">{email}</span>
                              )}
                            </div>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge variant="neutral">{roleName}</Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <div className="flex items-center gap-2">
                            <span className="text-caption font-caption text-default-font">
                              {walletAddr ? shortAddress(walletAddr) : "—"}
                            </span>
                            <SubframeCore.Tooltip.Provider>
                              <SubframeCore.Tooltip.Root>
                                <SubframeCore.Tooltip.Trigger asChild={true}>
                                  <IconButton
                                    variant="neutral-primary"
                                    size="small"
                                    icon={<FeatherCopy />}
                                    onClick={async () => {
                                      if (walletAddr) {
                                        try {
                                          await navigator.clipboard.writeText(walletAddr);
                                        } catch (e) {
                                          console.error("Failed to copy wallet address to clipboard:", e);
                                        }
                                      }
                                    }}
                                    disabled={!walletAddr}
                                  />
                                </SubframeCore.Tooltip.Trigger>
                                <SubframeCore.Tooltip.Portal>
                                  <SubframeCore.Tooltip.Content side="top" align="center" sideOffset={4} asChild={true}>
                                    <Tooltip>{walletAddr ? "Copy wallet address" : "No wallet address"}</Tooltip>
                                  </SubframeCore.Tooltip.Content>
                                </SubframeCore.Tooltip.Portal>
                              </SubframeCore.Tooltip.Root>
                            </SubframeCore.Tooltip.Provider>
                          </div>
                        </Table.Cell>
                        <Table.Cell>
                          <span className="text-body font-body text-neutral-500">-</span>
                        </Table.Cell>
                        <Table.Cell />
                      </Table.Row>
                    );
                  })}
                </Table>
              </div>
            ) : (
              <div className="flex w-full flex-col items-start gap-4 px-4 py-4">
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar>U</Avatar>
                    <div className="flex flex-col items-start">
                      <span className="line-clamp-1 text-body-bold font-body-bold text-default-font">
                        {connectedAddress ? "Connected Wallet" : "No Participants"}
                      </span>
                      <span className="text-caption font-caption text-subtext-color">
                        {connectedAddress ? shortAddress(connectedAddress) : "—"}
                      </span>
                    </div>
                  </div>
                  {connectedAddress && (
                    <Badge className="mobile:hidden" variant="neutral">Signer</Badge>
                  )}
                </div>
              </div>
            )
            }
          />

          {record?.observers && record.observers.length > 0 && (
            <DisplayCard
              icon={<FeatherEye />}
              title="Observers"
              divider
              content={
                <div className="flex w-full flex-col items-start gap-2 px-4 py-4">
                  <div className="flex w-full flex-wrap items-center gap-2">
                    {record.observers.map((email, index) => {
                      const initial = email?.[0]?.toUpperCase() || "O";
                      return (
                        <div key={index} className="flex items-center gap-2 rounded-lg border border-solid border-neutral-border bg-default-background px-1 py-1">
                          <Avatar size="x-small">{initial}</Avatar>
                          <span className="text-caption font-caption text-default-font">{email}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              }
            />
          )}

          <DisplayCard
            icon={<FeatherFileInput />}
            title="Actions & Inputs"
            divider
            footer
            footActions={
              <Button className="h-6 grow shrink-0 basis-0" variant="neutral-tertiary" size="small" onClick={() => onSetTab("actions")}>
                View Details
              </Button>
            }
            content={
            <div className="flex w-full flex-col items-start px-4 py-4">
              {previousStateLabel && (
                <div className="flex w-full items-center justify-between px-2 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-full border border-solid border-neutral-border bg-neutral-100 px-2 py-2">
                      <FeatherStepBack className="text-body-bold font-body-bold text-default-font" />
                    </div>
                    <span className="line-clamp-1 text-body-bold font-body-bold text-default-font">
                      Previous Step: {previousStateLabel}
                    </span>
                  </div>
                </div>
              )}
              {currentState && (
                <div className="flex w-full items-center justify-between rounded-md border border-solid border-brand-primary px-2 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-full border border-solid border-brand-primary bg-brand-100 px-2 py-2">
                      <FeatherCircleDot className="text-body-bold font-body-bold text-brand-primary" />
                    </div>
                    <span className="line-clamp-1 text-body-bold font-body-bold text-default-font">
                      Current Step: {stateLabel}
                    </span>
                  </div>
                </div>
              )}
              {!previousStateLabel && !currentState && (
                <div className="flex w-full items-center justify-between px-2 py-2">
                  <span className="text-body font-body text-subtext-color">No state information available</span>
                </div>
              )}
            </div>
            }
          />

          <DisplayCard
            className="mobile:hidden"
            icon={<FeatherActivity />}
            title="Recent Activity"
            divider
            footer
            footActions={
              <Button className="h-6 grow shrink-0 basis-0" variant="neutral-tertiary" size="small" onClick={() => onSetTab("activity")}>
                View Details
              </Button>
            }
            content={
            <div className="flex w-full flex-col items-start px-2 py-2">
              {activityLoading && activityInputs.length === 0 ? (
                <div className="w-full rounded-md bg-neutral-50 px-3 py-3 text-caption font-caption text-subtext-color">
                  Loading activity…
                </div>
              ) : activityWithInit.length === 0 ? (
                <div className="w-full rounded-md bg-neutral-50 px-3 py-3 text-caption font-caption text-subtext-color">
                  No activity yet.
                </div>
              ) : (
                activityWithInit.slice(0, 3).map((inp) => {
                  const isInit = inp.inputId === "__initialization__";
                  const inputDef = isInit ? null : (agreementJson as any)?.execution?.inputs?.[inp.inputId];
                  const title = isInit ? "Agreement Initialized" : (inputDef?.displayName || inp.inputId);
                  const when = inp.createdAt ? new Date(inp.createdAt) : null;
                  const whenLabel = when && !Number.isNaN(when.getTime())
                    ? (() => {
                        const now = Date.now();
                        const diff = now - when.getTime();
                        const hoursAgo = Math.floor(diff / (1000 * 60 * 60));
                        const daysAgo = Math.floor(diff / (1000 * 60 * 60 * 24));
                        if (hoursAgo < 1) return "Just now";
                        if (hoursAgo < 24) return `${hoursAgo} ${hoursAgo === 1 ? "hour" : "hours"} ago`;
                        if (daysAgo < 7) return `${daysAgo} ${daysAgo === 1 ? "day" : "days"} ago`;
                        return when.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
                      })()
                    : (inp.createdAt ? String(inp.createdAt) : "");
                  const values = inp.values || {};
                  const valueCount = Object.keys(values).length;
                  const description = valueCount > 0 ? `${valueCount} ${valueCount === 1 ? "field" : "fields"} submitted` : "Input submitted";
                  let submitterName = "";
                  if (isInit) {
                    const ownerParticipant = displayParticipants.find(p => p.variableKey && (record?.json as any)?.execution?.initialize?.data?.[p.variableKey]);
                    submitterName = ownerParticipant ? [ownerParticipant.firstName, ownerParticipant.lastName].filter(Boolean).join(" ") || ownerParticipant.email || "Owner" : "Owner";
                  } else if (inputDef?.issuer) {
                    const issuerNames = extractIssuerVariableKeys(inputDef.issuer)
                      .map((issuerVarKey) => {
                        const issuerParticipant = displayParticipants.find(p => p.variableKey === issuerVarKey);
                        if (!issuerParticipant) return issuerVarKey;
                        const fullName = [issuerParticipant.firstName, issuerParticipant.lastName].filter(Boolean).join(" ");
                        return fullName || issuerParticipant.email || issuerVarKey;
                      })
                      .filter(Boolean);
                    if (issuerNames.length > 0) {
                      submitterName = issuerNames.join(" or ");
                    }
                  }
                  return (
                    <div key={`${inp.txHash || ""}:${inp.inputId}:${inp.createdAt || ""}`} className="flex w-full items-start gap-3 rounded-md px-3 py-3 hover:bg-neutral-50">
                      <div className="flex flex-col items-center self-stretch">
                        <div className="flex h-2 w-2 flex-none flex-col items-start gap-2 rounded-full bg-brand-600" />
                        <div className="flex w-0.5 grow shrink-0 basis-0 flex-col items-center gap-2 bg-neutral-200" />
                      </div>
                      <div className="flex grow shrink-0 basis-0 flex-col items-start gap-1">
                        <span className="text-body-bold font-body-bold text-default-font">{String(title)}</span>
                        <span className="text-caption font-caption text-subtext-color">
                          {isInit
                            ? `${submitterName || "Owner"} deployed the agreement.`
                            : submitterName
                              ? `${submitterName} submitted ${valueCount > 0 ? valueCount : ""} ${valueCount === 1 ? "field" : valueCount > 0 ? "fields" : ""} for review.`.trim()
                              : description}
                        </span>
                        <span className="text-caption font-caption text-subtext-color">{whenLabel}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            }
          />
        </div>

        <div className="flex w-80 flex-none flex-col items-start gap-6 mobile:w-full">
          <DisplayCard
            icon={<FeatherWorkflow />}
            title="State Machine"
            divider
            footer
            footActions={
              <Button className="h-6 grow shrink-0 basis-0" variant="neutral-tertiary" size="small" onClick={() => onSetTab("stateMachine")}>
                View Details
              </Button>
            }
            content={
            <div className="flex w-full flex-col items-start gap-4 px-4 py-4">
              {agreementJson ? (
                <StateMachineFlowViewer
                  className="h-64"
                  showMiniMap={false}
                  agreementJson={agreementJson}
                  currentState={currentState}
                  initialState={(agreementJson as any)?.execution?.initialize?.initialState ?? null}
                />
              ) : null}
            </div>
            }
          />

          <DisplayCard
            icon={<FeatherFileText />}
            title="Document"
            headActions={
              <Button variant="neutral-secondary" size="small" icon={<FeatherDownloadCloud />} onClick={onDocumentPdfOrPrint}>
                Download PDF
              </Button>
            }
            divider
            footer
            footActions={
              <Button className="h-6 grow shrink-0 basis-0" variant="neutral-tertiary" size="small" onClick={() => onSetTab("document")}>
                View Details
              </Button>
            }
            content={
            <div className="flex w-full flex-col items-start gap-4 px-4 py-4">
              <div className="flex w-full flex-col items-center justify-center rounded-md border border-solid border-neutral-border bg-neutral-50 px-2 py-4">
                {agreementTemplateId && !documentThumbFailed ? (
                  <img
                    className="h-64 w-full rounded-md object-cover object-top shadow-md"
                    src={templateThumbUrl(agreementTemplateId)}
                    alt="Document preview"
                    loading="lazy"
                    onError={onDocumentThumbError}
                  />
                ) : documentPreviewMarkdown ? (
                  <div className="h-64 w-full overflow-y-auto rounded-md bg-neutral-50 px-3 py-2">
                    <MarkdownRenderer content={documentPreviewMarkdown} className="prose prose-sm max-w-none text-xs [&_h1]:text-sm [&_h2]:text-sm [&_h3]:text-xs [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5" />
                  </div>
                ) : (
                  <div className="flex h-64 w-full items-center justify-center">
                    <span className="text-caption font-caption text-subtext-color">No document preview</span>
                  </div>
                )}
              </div>
            </div>
            }
          />
        </div>
      </div>
    </div>
  );
}
