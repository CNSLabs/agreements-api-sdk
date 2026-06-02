import * as React from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useLogin } from "@/hooks/useLogin";
import { TextField } from "@/subframe/components/TextField";
import { Button } from "@/subframe/components/Button";
import { resolveStateLabel, toMillis } from "@/utils/agreementsUi";
import { useAgreementsApi } from "@/hooks/useAgreementsApi";
import { getChainLabel } from "@/utils/chainConfig";

type AgreementListItem = {
  id: string;
  address?: string;
  chainId?: number;
  status: "Draft" | "Deployed";
  state?: string;
  variables?: Record<string, unknown>;
  json?: any;
  displayName: string;
  updatedAt?: string | Date;
  createdAt?: string | Date;
};

export default function Agreements() {
  const navigate = useNavigate();
  const { address, isConnected } = useLogin();
  const { listAgreements } = useAgreementsApi();

  const { data: agreements, isLoading, error, refetch } = useQuery({
    queryKey: ["agreements"],
    enabled: !!address && isConnected,
    queryFn: async (): Promise<AgreementListItem[]> => {
      return (await listAgreements()) as AgreementListItem[];
    },
  });

  const [q, setQ] = React.useState("");
  const [stateFilter, setStateFilter] = React.useState<string>("__all__");

  const stateOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const a of agreements || []) {
      if (a?.state) set.add(a.state);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [agreements]);

  const filtered = React.useMemo(() => {
    const list = Array.isArray(agreements) ? [...agreements] : [];
    list.sort((a, b) => toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt));

    const qq = q.trim().toLowerCase();
    return list.filter((a) => {
      if (stateFilter !== "__all__" && a.state !== stateFilter) return false;
      if (!qq) return true;
      const name = String((a?.displayName || a?.json?.metadata?.name) || "").toLowerCase();
      const desc = String(a?.json?.metadata?.description || "").toLowerCase();
      const addr = String(a?.address || "").toLowerCase();
      const id = String(a?.id || "").toLowerCase();
      const stateLabel = String(resolveStateLabel({ agreementJson: a?.json, stateId: a?.state }) || "").toLowerCase();
      const statusStr = (a?.status || "").toLowerCase();
      return (
        name.includes(qq) ||
        desc.includes(qq) ||
        addr.includes(qq) ||
        id.includes(qq) ||
        stateLabel.includes(qq) ||
        statusStr.includes(qq)
      );
    });
  }, [agreements, q, stateFilter]);

  const handleOpenAgreement = (item: AgreementListItem) => {
    // Draft agreements should open in the document editor; deployed in the agreement viewer.
    if (item.status === "Draft") {
      navigate(`/document/${item.id}`);
    } else {
      navigate(`/agreement/${item.id}`);
    }
  };

  return (
    <div className="flex w-full flex-col items-start gap-6 px-6 py-8 container max-w-6xl mx-auto">
      <div className="flex w-full items-start justify-between gap-4 mobile:flex-col mobile:items-start">
        <div className="flex flex-col items-start gap-1">
          <h1 className="text-heading-2 font-heading-2 text-default-font">Agreements</h1>
          <p className="text-body font-body text-subtext-color">Search and filter your agreements.</p>
        </div>
        <Button size="large" onClick={() => navigate("/create")} className="flex-shrink-0">
          Create Agreement
        </Button>
      </div>

      <div className="flex w-full flex-col gap-3 rounded-lg border border-neutral-border bg-default-background px-6 py-5">
        <div className="flex w-full items-end gap-3 mobile:flex-col mobile:items-stretch">
          <div className="flex-1">
            <TextField label="Search">
              <TextField.Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, address, state…"
              />
            </TextField>
          </div>
          <div className="w-[260px] mobile:w-full">
            <TextField label="State">
              <select
                className="h-full w-full border-none bg-transparent text-body font-body text-default-font outline-none"
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
              >
                <option value="__all__">All</option>
                {stateOptions.map((s) => (
                  <option key={s} value={s}>
                    {resolveStateLabel({ agreementJson: (agreements || []).find((a) => a.state === s)?.json, stateId: s }) || s}
                  </option>
                ))}
              </select>
            </TextField>
          </div>
          <Button
            variant="neutral-secondary"
            onClick={() => {
              setQ("");
              setStateFilter("__all__");
            }}
          >
            Clear
          </Button>
        </div>

        {isLoading ? (
          <div className="flex w-full items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-4 py-10">
            <span className="text-body font-body text-subtext-color">Loading agreements…</span>
          </div>
        ) : error ? (
          <div className="flex w-full flex-col items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-4">
            <div className="text-body font-body text-red-700">
              Failed to load agreements: {(error as any)?.message || String(error)}
            </div>
            <Button size="small" variant="neutral-secondary" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex w-full items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-4 py-10">
            <div className="text-body font-body text-subtext-color">No agreements match your filters.</div>
          </div>
        ) : (
          <div className="flex w-full flex-col">
            {filtered.map((a, idx) => {
              const name = a?.displayName || a?.json?.metadata?.name || "Agreement";
              const stateLabel = resolveStateLabel({ agreementJson: a?.json, stateId: a?.state });
              const updated = a.updatedAt || a.createdAt;
              const isDraft = a.status === "Draft";
              return (
                <button
                  key={a.id}
                  onClick={() => handleOpenAgreement(a)}
                  className={`flex w-full items-center justify-between gap-4 px-1 py-4 text-left transition-colors hover:bg-neutral-50 ${
                    idx === 0 ? "" : "border-t border-neutral-border"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body font-body text-default-font">{name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {/* Status badge */}
                      {isDraft ? (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                          Draft
                        </span>
                      ) : (
                        <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] text-green-800">
                          Deployed
                        </span>
                      )}
                      {/* On-chain address (only for deployed) */}
                      {a.address && (
                        <span className="inline-flex items-center rounded-md border border-neutral-border bg-white px-2 py-1 font-mono text-[11px] text-subtext-color">
                          {a.address.slice(0, 6)}…{a.address.slice(-4)}
                        </span>
                      )}
                      {stateLabel && (
                        <span className="rounded-full border border-neutral-border bg-neutral-50 px-2 py-0.5 text-[11px] text-subtext-color">
                          {stateLabel}
                        </span>
                      )}
                      {a.chainId && (
                        <span className="rounded-full border border-neutral-border bg-neutral-50 px-2 py-0.5 text-[11px] text-subtext-color">
                          {getChainLabel(a.chainId)}
                        </span>
                      )}
                      {updated && (
                        <span className="text-caption font-caption text-subtext-color">
                          Last Updated: {new Date(updated as any).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <svg
                    className="h-4 w-4 text-subtext-color"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


