import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import * as SubframeCore from "@subframe/core";
import { Badge } from "@/subframe/components/Badge";
import { Button } from "@/subframe/components/Button";
import { Checkbox } from "@/subframe/components/Checkbox";
import { DropdownMenu } from "@/subframe/components/DropdownMenu";
import { PageHeader } from "@/subframe/components/PageHeader";
import { TextField } from "@/subframe/components/TextField";
import { useTemplatesApi } from "@/hooks/useTemplatesApi";
import { FeatherFilter, FeatherSearch, FeatherX } from "@subframe/core";
import { useAgreementsApi } from "@/hooks/useAgreementsApi";
import { useAuthInit } from "@/components/AuthInitProvider";
import { getInitialShowDefaultTemplates } from "./createAgreementFilters";
type TemplateSource = "default" | "whitelisted";

const CreateAgreement: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { listTemplates } = useTemplatesApi();

  const {
    data: allTemplates = [],
    isLoading: isTemplatesLoading,
    error: templatesError,
    refetch: refetchTemplates,
  } = useQuery({
    queryKey: ["templates"],
    queryFn: () => listTemplates(),
  });
  const [showDefaultTemplatesOverride, setShowDefaultTemplatesOverride] = useState<boolean | null>(null);
  const { status: authStatus } = useAuthInit();
  const { getAvailableTemplateIds } = useAgreementsApi();
  const [templateAccess, setTemplateAccess] = useState<{
    defaultTemplateIds: string[];
    whitelistedTemplateIds: string[];
  } | null>(null);
  const [idsError, setIdsError] = useState<Error | null>(null);

  useEffect(() => {
    if (authStatus !== "ready") return;
    setIdsError(null);
    getAvailableTemplateIds()
      .then((res) => setTemplateAccess(res))
      .catch((e) => {
        setIdsError(e instanceof Error ? e : new Error(String(e)));
        setTemplateAccess({
          defaultTemplateIds: [],
          whitelistedTemplateIds: [],
        });
      });
  }, [authStatus, getAvailableTemplateIds]);

  const isTemplateAccessLoading = authStatus !== "ready" || templateAccess === null;
  const showDefaultTemplates = showDefaultTemplatesOverride
    ?? (templateAccess ? getInitialShowDefaultTemplates(templateAccess) : true);
  const templateSourceById = useMemo(() => {
    if (templateAccess === null) return new Map<string, TemplateSource>();
    const next = new Map<string, TemplateSource>();
    for (const templateId of templateAccess.defaultTemplateIds) {
      next.set(templateId, "default");
    }
    for (const templateId of templateAccess.whitelistedTemplateIds) {
      if (!next.has(templateId)) {
        next.set(templateId, "whitelisted");
      }
    }
    return next;
  }, [templateAccess]);
  const availableTemplates = useMemo(() => {
    if (templateAccess === null) return [];
    const allowedSet = new Set(templateSourceById.keys());
    return allTemplates.filter((t) => {
      const templateKey = t.templateId || t.id;
      if (!allowedSet.has(templateKey)) return false;
      const templateSource = templateSourceById.get(templateKey);
      if (!showDefaultTemplates && templateSource === "default") return false;
      return true;
    });
  }, [allTemplates, showDefaultTemplates, templateAccess, templateSourceById]);
  const isLoading = isTemplatesLoading || isTemplateAccessLoading;

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableTemplates;
    return availableTemplates.filter((t) => {
      const hay = `${t.name || ""} ${t.description || ""} ${t.author || ""} ${t.version || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [availableTemplates, query]);

  const handleTemplateSelect = (templateId: string) => {
    navigate(`/templates/${templateId}`);
  };

  return (
    <div className="flex h-full w-full flex-col items-center bg-neutral-50">
        <PageHeader
          className="relative z-10"
          title="Templates"
          subtitle="Select a template to use for your next agreement."
          actions={
            <Button
              variant="neutral-secondary"
              icon={<FeatherX />}
              onClick={() => navigate("/home")}
            >
              Cancel
            </Button>
          }
          controls={
            <div className="flex grow shrink-0 basis-0 items-center gap-2">
              <TextField
                className="h-auto grow shrink-0 basis-0"
                variant="filled"
                label=""
                helpText=""
                icon={<FeatherSearch />}
              >
                <TextField.Input
                  placeholder="Search templates..."
                  value={query}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.target.value)}
                />
              </TextField>
              <SubframeCore.DropdownMenu.Root>
                <SubframeCore.DropdownMenu.Trigger asChild={true}>
                  <Button
                    variant="neutral-secondary"
                    icon={<FeatherFilter />}
                  >
                    Filter
                  </Button>
                </SubframeCore.DropdownMenu.Trigger>
                <SubframeCore.DropdownMenu.Portal>
                  <SubframeCore.DropdownMenu.Content
                    side="bottom"
                    align="end"
                    sideOffset={4}
                    asChild={true}
                  >
                    <DropdownMenu className="z-[100] min-w-[240px] p-3">
                      <div className="flex w-full flex-col items-start gap-3">
                        <span className="text-caption font-caption text-subtext-color">
                          Show templates
                        </span>
                        <Checkbox
                          checked={showDefaultTemplates}
                          disabled={isTemplateAccessLoading}
                          onCheckedChange={setShowDefaultTemplatesOverride}
                          label="Default templates"
                        />
                      </div>
                    </DropdownMenu>
                  </SubframeCore.DropdownMenu.Content>
                </SubframeCore.DropdownMenu.Portal>
              </SubframeCore.DropdownMenu.Root>
            </div>
          }
        />

        <div className="flex w-full grow shrink-0 basis-0 flex-col items-center gap-6 overflow-hidden overflow-y-auto px-6 py-8 mobile:px-4 mobile:py-4">
          {isLoading ? (
            <div className="flex w-full max-w-[1280px] items-center justify-center py-16 text-body text-subtext-color">
              Loading templates...
            </div>
          ) : idsError ? (
            <div className="flex w-full max-w-[1280px] flex-col items-center justify-center gap-2 py-16 text-body text-default-font">
              <span className="text-subtext-color">Could not load template access.</span>
              <Button variant="neutral-secondary" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          ) : templatesError ? (
            <div className="w-full max-w-[1280px] rounded-lg border border-red-200 bg-red-50 px-6 py-6">
              <div className="text-body font-body text-red-700">
                Failed to load templates: {(templatesError as Error)?.message || String(templatesError)}
              </div>
              <div className="mt-4">
                <Button variant="neutral-secondary" onClick={() => refetchTemplates()}>
                  Retry
                </Button>
              </div>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex w-full max-w-[1280px] items-center justify-center py-16 text-body text-subtext-color">
              No templates available for your account.
            </div>
          ) : (
          <div className="w-full max-w-[1280px] items-start gap-6 grid grid-cols-4 mobile:grid mobile:grid-cols-1">
            {filteredTemplates.map((template) => {
              const templateKey = template.templateId || template.id;
              const templateSource = templateSourceById.get(templateKey);
              return (
                <div
                  key={templateKey}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleTemplateSelect(templateKey)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleTemplateSelect(templateKey);
                  }}
                  className="flex h-full flex-col items-start overflow-hidden rounded-lg border border-solid border-brand-primary bg-default-background cursor-pointer hover:shadow-brand-glow transition-shadow"
                >
                  <div className="flex w-full items-center justify-center bg-brand-50 px-2 py-4">
                    <img
                      className="h-64 grow shrink-0 basis-0 rounded-md object-cover object-top shadow-md"
                      src={template.assets?.thumbnailUrl}
                      alt={`${template.name} preview`}
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <div className="flex w-full grow flex-col items-start gap-2 px-4 py-4">
                    <span className="line-clamp-2 w-full min-h-[3.5rem] text-heading-3 font-heading-3 text-default-font">
                      {template.name}
                    </span>
                    <span className="line-clamp-3 w-full min-h-[4.5rem] text-body font-body text-default-font">
                      {template.description}
                    </span>
                    <div className="mt-auto flex w-full items-center gap-2 pt-2">
                      <span className="text-caption font-caption text-subtext-color">
                        {template.author}
                      </span>
                      {templateSource === "default" ? (
                        <Badge variant="brand">Default</Badge>
                      ) : templateSource === "whitelisted" ? (
                        <Badge variant="neutral">Shared With You</Badge>
                      ) : null}
                      <Badge variant="neutral">v{template.version}</Badge>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          )} 
        </div>
    </div>
  );
};

export default CreateAgreement;
