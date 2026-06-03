import * as React from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useLogin } from "@/hooks/useLogin";
import { Badge } from "@/subframe/components/Badge";
import { Button } from "@/subframe/components/Button";
import { LinkButton } from "@/subframe/components/LinkButton";
import { Table } from "@/subframe/components/Table";
import {
  FeatherChevronRight,
  FeatherCircleDot,
  FeatherClock,
  FeatherFileInput,
  FeatherFileJson,
  FeatherFilePlus,
  FeatherInfo,
} from "@subframe/core";
import { computeAvailableActions } from "@/utils/agreementsActions";
import { formatWhen, isTerminalStateByDfsm, resolveStateLabel, toMillis } from "@/utils/agreementsUi";
import { useAgreementsApi } from "@/hooks/useAgreementsApi";
import { getChainLabel } from "@/utils/chainConfig";

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { address, isConnected } = useLogin();
  const { listAgreements } = useAgreementsApi();

  // Track visible badge counts per agreement to prevent overflow
  const [visibleBadgeCounts, setVisibleBadgeCounts] = React.useState<Map<string, number>>(new Map());
  const badgeContainerRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());

  type AgreementListItem = {
    id: string;
    address?: string;
    chainId?: number;
    status: "Draft" | "Deployed";
    state?: string;
    variables?: Record<string, unknown>;
    json?: any;
    displayName?: string;
    lastInputId?: string;
    lastInputAt?: string | Date;
    updatedAt?: string | Date;
    createdAt?: string | Date;
  };

  const { data: agreements, isLoading, error, refetch } = useQuery({
    queryKey: ["agreements"],
    enabled: !!address && isConnected,
    queryFn: async (): Promise<AgreementListItem[]> => {
      return (await listAgreements()) as AgreementListItem[];
    },
  });


  const handleCreateAgreement = () => {
    navigate("/create");
  };

  const handleOpenAgreement = (item: AgreementListItem) => {
    if (item.status === "Draft") {
      navigate(`/document/${item.id}`);
    } else {
      navigate(`/agreement/${item.id}`);
    }
  };

  const handleReviewAction = React.useCallback(
    (params: { agreementId: string; inputId: string }) => {
      const { agreementId, inputId } = params;
      navigate(`/agreement/${agreementId}?input=${encodeURIComponent(inputId)}`);
    },
    [navigate],
  );

  function formatRelative(ts: unknown): string {
    const ms = toMillis(ts);
    if (!ms) return "";
    const delta = Date.now() - ms;
    const min = Math.floor(delta / 60000);
    if (min < 1) return "Just now";
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
    const day = Math.floor(hr / 24);
    if (day === 1) return "Yesterday";
    return new Date(ms).toLocaleDateString();
  }

  // Draft agreements owned by the user that still need deployment
  const drafts = React.useMemo(() => {
    if (!Array.isArray(agreements)) return [];
    return agreements
      .filter((a) => a.status === "Draft")
      .sort((a, b) => toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt));
  }, [agreements]);

  // Deployed agreements with available inputs for the user
  const awaitingInputs = React.useMemo(() => {
    const items = computeAvailableActions({
      agreements: agreements as any,
      userAddress: address,
    });

    const byAgreement = new Map<
      string,
      {
        agreementId: string;
        agreementAddress: string;
        agreementName: string;
        currentStateLabel?: string;
        updatedAt?: string | Date;
        inputs: { inputId: string; label: string }[];
        chainId?: number;
      }
    >();

    for (const x of items) {
      const existing = byAgreement.get(x.agreementAddress);
      if (!existing) {
        byAgreement.set(x.agreementAddress, {
          agreementId: x.agreementId,
          agreementAddress: x.agreementAddress,
          agreementName: x.agreementName,
          currentStateLabel: x.currentStateLabel || x.currentState,
          updatedAt: x.agreementUpdatedAt,
          chainId: x.chainId,
          inputs: [{ inputId: x.inputId, label: x.inputLabel }],
        });
      } else {
        if (x.agreementUpdatedAt && toMillis(x.agreementUpdatedAt) > toMillis(existing.updatedAt)) {
          existing.updatedAt = x.agreementUpdatedAt;
        }
        if (!existing.inputs.find((i) => i.inputId === x.inputId)) {
          existing.inputs.push({ inputId: x.inputId, label: x.inputLabel });
        }
      }
    }

    const list = Array.from(byAgreement.values());
    list.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    return list;
  }, [address, agreements]);

  // Combined count: drafts + deployed agreements awaiting input
  const awaitingTotalCount = drafts.length + awaitingInputs.length;

  // Dynamically check if badges overflow and condense if needed
  React.useEffect(() => {
    // Initialize with conservative count (start with 2, will expand if space allows)
    setVisibleBadgeCounts(prev => {
      const merged = new Map(prev);
      awaitingInputs.forEach(agreement => {
        if (!merged.has(agreement.agreementAddress)) {
          // Start conservatively with 2 badges, will adjust based on available space
          merged.set(agreement.agreementAddress, Math.min(2, agreement.inputs.length));
        }
      });
      return merged;
    });

    const checkOverflow = () => {
      setVisibleBadgeCounts(prev => {
        const newCounts = new Map(prev);
        let hasChanges = false;

        badgeContainerRefs.current.forEach((container, agreementKey) => {
          const agreement = awaitingInputs.find(a => a.agreementAddress === agreementKey);
          if (!agreement || agreement.inputs.length === 0) return;

          const children = Array.from(container.children) as HTMLElement[];
          if (children.length === 0) return;

          // Calculate total width needed
          const containerWidth = container.offsetWidth;
          if (containerWidth === 0) return; // Not yet rendered

          let totalWidth = 0;
          const gap = 8; // gap-2 = 8px

          // Measure all badge elements (including the "+X" badge if present)
          children.forEach((badge, idx) => {
            if (idx > 0) totalWidth += gap;
            totalWidth += badge.offsetWidth;
          });

          // Check if overflowing - add small buffer (10px) to prevent edge cases
          const isOverflowing = totalWidth > (containerWidth - 10) || container.scrollHeight > 50;
          const currentCount = newCounts.get(agreementKey) ?? 2;

          if (isOverflowing && currentCount > 1) {
            // Reduce count to make room for "+X" badge
            const newCount = Math.max(1, currentCount - 1);
            if (newCount !== currentCount) {
              newCounts.set(agreementKey, newCount);
              hasChanges = true;
            }
          } else if (!isOverflowing && currentCount < agreement.inputs.length) {
            // Can fit more, try adding one
            const newCount = Math.min(agreement.inputs.length, currentCount + 1);
            if (newCount !== currentCount) {
              newCounts.set(agreementKey, newCount);
              hasChanges = true;
            }
          }
        });

        return hasChanges ? newCounts : prev;
      });
    };

    // Check immediately and after DOM updates
    const checkImmediately = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(checkOverflow);
      });
    };

    // Run immediately
    checkImmediately();

    // Also check after a short delay to ensure DOM is fully rendered
    const timeoutId = setTimeout(checkImmediately, 100);

    // Also check on resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        setTimeout(checkOverflow, 10);
      });
    });

    badgeContainerRefs.current.forEach(container => {
      resizeObserver.observe(container);
    });

    window.addEventListener('resize', checkOverflow);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', checkOverflow);
    };
  }, [awaitingInputs]);

  const activity = React.useMemo(() => {
    const list = Array.isArray(agreements) ? [...agreements] : [];
    list.sort((a, b) => toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt));
    return list;
  }, [agreements]);

  return (
    <div className="flex min-h-full w-full flex-col bg-default-background text-default-font">
      <div className="grid w-full grid-cols-1 gap-[10px] p-[10px] lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="shodai-module shodai-grid-surface flex min-h-[260px] flex-col justify-between p-[10px]">
          <div className="flex items-start justify-between gap-[10px]">
            <span className="text-caption font-caption text-subtext-color">
              AGREEMENTS
            </span>
            <Badge variant="neutral">
              {isConnected ? "Connected" : "Signed out"}
            </Badge>
          </div>
          <div className="flex max-w-[760px] flex-col gap-[10px]">
            <h1 className="text-heading-1 font-heading-1 text-default-font">
              Agreement operations
            </h1>
            <p className="text-heading-3 font-heading-3 text-subtext-color">
              Draft, deploy, and operate living agreements from one console.
            </p>
          </div>
        </section>

        <section className="shodai-module flex min-h-[260px] flex-col justify-between p-[10px]">
          <div className="flex items-start justify-between gap-[10px]">
            <span className="text-caption font-caption text-subtext-color">
              ACTIONS
            </span>
            <Badge>{awaitingTotalCount}</Badge>
          </div>
          <div className="grid grid-cols-2 border border-neutral-border">
            <div className="flex min-h-[88px] flex-col justify-between border-r border-neutral-border p-[10px]">
              <span className="text-caption font-caption text-subtext-color">
                Drafts
              </span>
              <span className="text-heading-2 font-heading-2 text-default-font">
                {drafts.length}
              </span>
            </div>
            <div className="flex min-h-[88px] flex-col justify-between p-[10px]">
              <span className="text-caption font-caption text-subtext-color">
                Inputs
              </span>
              <span className="text-heading-2 font-heading-2 text-default-font">
                {awaitingInputs.length}
              </span>
            </div>
          </div>
          <Button
            className="h-10 w-full flex-none"
            size="large"
            icon={<FeatherFilePlus />}
            onClick={handleCreateAgreement}
          >
            CREATE AGREEMENT
          </Button>
        </section>
      </div>

      <div className="flex w-full flex-col items-start gap-[10px] px-[10px] pb-[10px]">
        {/* Awaiting Input */}
        <div className="shodai-module flex w-full flex-col items-start gap-[20px] px-[10px] py-[10px]">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-heading-3 font-heading-3 text-default-font">
                Awaiting Input
              </span>
              <div className="flex items-center justify-center rounded-full bg-brand-100 px-2 py-0.5">
                <span className="text-caption-bold font-caption-bold text-brand-700">
                  {awaitingTotalCount}
                </span>
              </div>
            </div>
            <LinkButton iconRight={<FeatherChevronRight />} onClick={() => navigate("/agreements")}>
              View all
            </LinkButton>
          </div>

          <Table
            header={
              <Table.HeaderRow>
                <Table.HeaderCell>AGREEMENT NAME</Table.HeaderCell>
                <Table.HeaderCell>STATE</Table.HeaderCell>
                <Table.HeaderCell>NETWORK</Table.HeaderCell>
                <Table.HeaderCell>INPUTS AVAILABLE</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.HeaderRow>
            }
          >
            {isLoading ? (
              <Table.Row>
                <Table.Cell className="text-subtext-color">Loading…</Table.Cell>
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
              </Table.Row>
            ) : error ? (
              <Table.Row>
                <Table.Cell className="text-error-700">
                  Failed to load: {(error as any)?.message || String(error)}
                </Table.Cell>
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
                <Table.Cell>
                  <Button size="small" variant="neutral-secondary" onClick={() => refetch()}>
                    Retry
                  </Button>
                </Table.Cell>
              </Table.Row>
            ) : awaitingTotalCount === 0 ? (
              <Table.Row>
                <Table.Cell className="text-subtext-color">No actions awaiting your input.</Table.Cell>
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
              </Table.Row>
            ) : (
              <>
                {/* Draft agreements needing deployment */}
                {drafts.slice(0, 5).map((draft) => {
                  const name = draft.displayName || draft?.json?.metadata?.name || "Agreement";
                  return (
                    <Table.Row
                      key={`draft-${draft.id}`}
                      clickable
                      onClick={() => navigate(`/document/${draft.id}`)}
                    >
                      <Table.Cell>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center rounded-md bg-neutral-100 px-2 py-2">
                            <FeatherFileJson className="text-body font-body text-neutral-600" />
                          </div>
                          <span className="whitespace-nowrap text-body-bold font-body-bold text-default-font">
                            {name}
                          </span>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge variant="neutral" icon={<FeatherCircleDot />}>
                          Draft
                        </Badge>
                      </Table.Cell>
                      <Table.Cell className="max-w-[180px] overflow-hidden">
                        <Badge className="max-w-[180px] flex-none overflow-hidden" variant="neutral">{getChainLabel(draft.chainId)}</Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge variant="neutral" icon={<FeatherFileInput />}>
                          Initialize Variables
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex grow shrink-0 basis-0 items-start justify-end">
                          <Button
                            variant="brand-secondary"
                            size="small"
                            iconRight={<FeatherChevronRight />}
                            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                              event.preventDefault();
                              event.stopPropagation();
                              navigate(`/document/${draft.id}`);
                            }}
                          >
                            Deploy Now
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}

                {/* Deployed agreements with available inputs */}
                {awaitingInputs.slice(0, 5 - Math.min(drafts.length, 5)).map((row) => {
                  const inputs = row.inputs;
                  const agreementKey = row.agreementAddress;
                  const visibleCount = visibleBadgeCounts.get(agreementKey) ?? inputs.length;
                  const shown = inputs.slice(0, visibleCount);
                  const more = inputs.length - shown.length;
                  const primaryInput = inputs[0]?.inputId;

                  return (
                    <Table.Row
                      key={row.agreementAddress}
                      clickable
                      onClick={() => navigate(`/agreement/${row.agreementId}`)}
                    >
                      <Table.Cell>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center rounded-md bg-neutral-100 px-2 py-2">
                            <FeatherFileJson className="text-body font-body text-neutral-600" />
                          </div>
                          <span className="whitespace-nowrap text-body-bold font-body-bold text-default-font">
                            {row.agreementName}
                          </span>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge icon={<FeatherCircleDot />}>{row.currentStateLabel || "Unknown"}</Badge>
                      </Table.Cell>
                      <Table.Cell className="max-w-[180px] overflow-hidden">
                        <Badge className="max-w-[180px] flex-none overflow-hidden" variant="neutral">{getChainLabel(row.chainId)}</Badge>
                      </Table.Cell>
                      <Table.Cell>
                        <div
                          ref={(el) => {
                            if (el) {
                              badgeContainerRefs.current.set(agreementKey, el);
                            } else {
                              badgeContainerRefs.current.delete(agreementKey);
                            }
                          }}
                          className="flex items-center gap-2 flex-nowrap"
                          style={{ minWidth: 0, maxWidth: '100%', overflow: 'hidden' }}
                        >
                          {shown.map((x) => (
                            <Badge key={x.inputId} variant="neutral" icon={<FeatherFileInput />} style={{ flexShrink: 0 }}>
                              {x.label}
                            </Badge>
                          ))}
                          {more > 0 && (
                            <Badge variant="neutral" style={{ flexShrink: 0 }}>+{more}</Badge>
                          )}
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex grow shrink-0 basis-0 items-start justify-end">
                          <Button
                            variant="brand-secondary"
                            size="small"
                            iconRight={<FeatherChevronRight />}
                            onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (primaryInput) handleReviewAction({ agreementId: row.agreementId, inputId: primaryInput });
                            }}
                          >
                            Review Now
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </>
            )}
          </Table>
        </div>

        {/* Agreement Activity */}
        <div className="shodai-module flex w-full flex-col items-start gap-[20px] px-[10px] py-[10px]">
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-heading-3 font-heading-3 text-default-font">
                Agreement Activity
              </span>
              <FeatherInfo className="text-body font-body text-subtext-color" />
            </div>
            <LinkButton iconRight={<FeatherChevronRight />} onClick={() => navigate("/agreements")}>
              View all
            </LinkButton>
          </div>

          <Table
            header={
              <Table.HeaderRow>
                <Table.HeaderCell>AGREEMENT NAME</Table.HeaderCell>
                <Table.HeaderCell>LAST UPDATED</Table.HeaderCell>
                <Table.HeaderCell>NETWORK</Table.HeaderCell>
                <Table.HeaderCell>ACTIVITY</Table.HeaderCell>
                <Table.HeaderCell>STATUS</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.HeaderRow>
            }
          >
            {isLoading ? (
              <Table.Row>
                <Table.Cell className="text-subtext-color">Loading…</Table.Cell>
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
              </Table.Row>
            ) : error ? (
              <Table.Row>
                <Table.Cell className="text-error-700">
                  Failed to load: {(error as any)?.message || String(error)}
                </Table.Cell>
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
                <Table.Cell>
                  <Button size="small" variant="neutral-secondary" onClick={() => refetch()}>
                    Retry
                  </Button>
                </Table.Cell>
              </Table.Row>
            ) : activity.length === 0 ? (
              <Table.Row>
                <Table.Cell className="text-subtext-color">No agreements yet.</Table.Cell>
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
                <Table.Cell />
              </Table.Row>
            ) : (
              activity.slice(0, 5).map((a) => {
                const name = a.displayName || a?.json?.metadata?.name || "Agreement";
                const updated = a.lastInputAt || a.updatedAt || a.createdAt;
                const isDraft = a.status === "Draft";
                const stateLabel = isDraft
                  ? "Draft"
                  : resolveStateLabel({ agreementJson: a?.json, stateId: a?.state }) || a.state || "Unknown";
                const terminal = !isDraft && isTerminalStateByDfsm({ agreementJson: a?.json, state: a?.state });
                const lastInputId = a.lastInputId;
                const lastInputLabel =
                  (lastInputId && a?.json?.execution?.inputs?.[lastInputId]?.displayName) ||
                  lastInputId ||
                  "Initialized";
                const activityLabel = isDraft ? "Created" : terminal ? "Completed" : lastInputLabel;
                return (
                  <Table.Row key={a.id} clickable onClick={() => handleOpenAgreement(a)}>
                    <Table.Cell>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center rounded-md bg-neutral-100 px-2 py-2">
                          <FeatherFileJson className="text-body font-body text-neutral-700" />
                        </div>
                        <span className="whitespace-nowrap text-body-bold font-body-bold text-default-font">
                          {name}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge variant="neutral" icon={<FeatherClock />}>
                        {updated ? formatRelative(updated) : ""}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell className="max-w-[180px] overflow-hidden">
                      <Badge className="max-w-[180px] flex-none overflow-hidden" variant="neutral">{getChainLabel(a.chainId)}</Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge variant="neutral" icon={<FeatherFileInput />}>
                        {activityLabel}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      {terminal ? (
                        <Badge variant="success">Completed</Badge>
                      ) : (
                        <Badge icon={<FeatherCircleDot />}>{stateLabel}</Badge>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex grow shrink-0 basis-0 items-start justify-end">
                        <FeatherChevronRight className="text-body font-body text-subtext-color" />
                      </div>
                    </Table.Cell>
                  </Table.Row>
                );
              })
            )}
          </Table>
        </div>

        {/* Debug / fallback */}
        {process.env.NODE_ENV !== "production" && (
          <div className="hidden">
            {formatWhen(activity[0]?.updatedAt)}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
