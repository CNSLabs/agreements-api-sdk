import React from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/subframe/components/Badge";
import { Button } from "@/subframe/components/Button";
import { PageHeader } from "@/subframe/components/PageHeader";
import { Segment } from "@/subframe/components/Segment";
import { useTemplatesApi, type AgreementTemplate } from "@/hooks/useTemplatesApi";
import StateMachineFlowViewer from "@/components/StateMachineFlowViewer";
import { DeploymentNetworkSelect } from "@/components/DeploymentNetworkSelect";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import type { Components } from "react-markdown";
import {
  FeatherChevronLeft,
  FeatherChevronRight,
  FeatherFileText,
  FeatherGitBranch,
  FeatherWorkflow,
} from "@subframe/core";
import { useAgreementsApi } from "@/hooks/useAgreementsApi";
import { useAuthInit } from "@/components/AuthInitContext";
import { getDefaultChainConfig, getSupportedChainConfigs } from "@/utils/chainConfig";

type TemplateVariable = { name?: string };
type PreviewAgreementTemplate = AgreementTemplate & {
  content?: { data?: unknown };
  variables?: Record<string, TemplateVariable>;
};

const EMPTY_VARIABLES: Record<string, TemplateVariable> = {};
type TemplateSource = "default" | "whitelisted";

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      response?: { data?: { message?: unknown } };
      message?: unknown;
    };
    const responseMessage = maybeError.response?.data?.message;
    if (typeof responseMessage === "string" && responseMessage.trim().length > 0) {
      return responseMessage;
    }
    if (typeof maybeError.message === "string" && maybeError.message.trim().length > 0) {
      return maybeError.message;
    }
  }
  return "Failed to create draft agreement";
}

function getQueryErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      response?: { data?: { message?: unknown } };
      message?: unknown;
    };
    const responseMessage = maybeError.response?.data?.message;
    if (typeof responseMessage === "string" && responseMessage.trim().length > 0) {
      return responseMessage;
    }
    if (typeof maybeError.message === "string" && maybeError.message.trim().length > 0) {
      return maybeError.message;
    }
  }

  return fallback;
}

const TemplatePreview: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const templateId = params.templateId as string | undefined;
  const [tab, setTab] = React.useState<"document" | "stateMachine">("document");
  const [isCreatingDraft, setIsCreatingDraft] = React.useState(false);
  const [draftError, setDraftError] = React.useState<string | null>(null);
  const [templateSource, setTemplateSource] = React.useState<TemplateSource | null>(null);
  const supportedChains = React.useMemo(() => getSupportedChainConfigs(), []);
  const [selectedChainId, setSelectedChainId] = React.useState(() => getDefaultChainConfig().chainId);
  const { status: authStatus } = useAuthInit();
  const { createDraftAgreement, getAvailableTemplateIds } = useAgreementsApi();
  const { getTemplateById } = useTemplatesApi();

  const {
    data: template,
    isLoading: isTemplateLoading,
    error: templateError,
    refetch: refetchTemplate,
  } = useQuery({
    queryKey: ["template", templateId],
    queryFn: async () => {
      if (!templateId) {
        throw new Error("Missing template id");
      }

      return getTemplateById(templateId) as Promise<PreviewAgreementTemplate>;
    },
    enabled: !!templateId,
  });

  // Redirect to template list if user is not allowed to use this template
  React.useEffect(() => {
    if (authStatus !== "ready" || !templateId) return;
    getAvailableTemplateIds()
      .then((res) => {
        const defaults = new Set(res.defaultTemplateIds);
        const whitelisted = new Set(res.whitelistedTemplateIds);
        const allowed = new Set([...defaults, ...whitelisted]);
        if (defaults.has(templateId)) {
          setTemplateSource("default");
        } else if (whitelisted.has(templateId)) {
          setTemplateSource("whitelisted");
        } else {
          setTemplateSource(null);
        }
        if (!allowed.has(templateId)) {
          navigate("/templates", { replace: true });
        }
      })
      .catch(() => {
        navigate("/templates", { replace: true });
      });
  }, [authStatus, templateId, getAvailableTemplateIds, navigate]);

  const metadata = template?.metadata;
  const contentMd = template?.content?.data;
  const variables = React.useMemo<Record<string, TemplateVariable>>(
    () => template?.variables ?? EMPTY_VARIABLES,
    [template],
  );
  const templateErrorMessage = templateError
    ? getQueryErrorMessage(templateError, "Failed to load template")
    : null;

  const previewMarkdown = React.useMemo(() => {
    if (!contentMd || typeof contentMd !== "string") return null;

    // Replace variable placeholders with highlighted inline tokens so the prose is readable.
    // Use the human-readable variable name when available, falling back to the variable ID.
    // Example: ${variables.payerEthaddress} -> <span ...>Payer Address</span>
    return contentMd.replace(/\$\{variables\.([^}]+)\}/g, (_match, variablePath) => {
      const variableId = String(variablePath).split(".")[0];
      const variableName = variables[variableId]?.name;
      const displayName = typeof variableName === "string" && variableName.length > 0
        ? variableName
        : variableId;
      return `<span class="inline-flex h-7 min-h-7 max-h-7 items-center align-middle whitespace-nowrap rounded-sm border border-solid border-brand-100 bg-brand-50 px-2 text-monospace-body leading-none font-monospace-body text-default-font">${displayName}</span>`;
    });
  }, [contentMd, variables]);

  const previewComponents = React.useMemo<Components>(
    () => ({
      h1: ({ children }) => <h1 className="text-heading-1 font-heading-1 mb-4">{children}</h1>,
      h2: ({ children }) => <h2 className="text-heading-2 font-heading-2 mb-3">{children}</h2>,
      h3: ({ children }) => <h3 className="text-heading-3 font-heading-3 mb-2">{children}</h3>,
      p: ({ children, ...props }) => (
        <p className="text-body font-body mb-4" {...props}>
          {children}
        </p>
      ),
      ul: ({ children }) => <ul className="mb-4 list-disc list-inside">{children}</ul>,
      ol: ({ children }) => <ol className="mb-4 list-decimal list-inside">{children}</ol>,
      li: ({ children }) => <li className="text-body font-body">{children}</li>,
      blockquote: ({ children }) => (
        <blockquote className="border-l-4 border-neutral-300 pl-4 italic mb-4">{children}</blockquote>
      ),
      code: ({ children }) => (
        <code className="bg-neutral-100 rounded px-2 py-1 font-mono text-caption">{children}</code>
      ),
      pre: ({ children }) => <pre className="bg-neutral-100 rounded p-4 mb-4 overflow-x-auto">{children}</pre>,
      a: ({ children, href }) => (
        <a href={href} className="text-brand-600 hover:underline">
          {children}
        </a>
      ),
      strong: ({ children }) => <strong className="font-bold">{children}</strong>,
      em: ({ children }) => <em className="italic">{children}</em>,
      u: ({ children }) => <u className="underline">{children}</u>,
    }),
    []
  );

  const handleUseTemplate = React.useCallback(async () => {
    if (!templateId) return;
    setDraftError(null);
    setIsCreatingDraft(true);
    try {
      const draft = await createDraftAgreement({
        templateId,
        displayName: "",
        chainId: selectedChainId,
      });
      navigate(`/document/${draft.id}`);
    } catch (error: unknown) {
      setDraftError(getErrorMessage(error));
    } finally {
      setIsCreatingDraft(false);
    }
  }, [createDraftAgreement, navigate, selectedChainId, templateId]);

  const authorName = String(metadata?.author || "Agreements Protocol");

  return (
    <div className="flex h-full w-full flex-col items-center bg-neutral-50">
      <PageHeader
        className="relative z-10"
        title={String(metadata?.name || "Template Preview")}
        subtitle={String(metadata?.description || "Review the template before creating an agreement.")}
        showTags={true}
        actions={
          <div className="flex items-end gap-3">
            <Button
              variant="neutral-secondary"
              icon={<FeatherChevronLeft />}
              onClick={() => navigate("/create")}
            >
              Back
            </Button>
            <Button
              iconRight={<FeatherChevronRight />}
              onClick={handleUseTemplate}
              disabled={!templateId || isCreatingDraft}
            >
              {isCreatingDraft ? "Creating Draft…" : "Use Template"}
            </Button>
          </div>
        }
        tags={
          <>
            {templateSource === "default" ? (
              <Badge
                className="h-7 w-auto flex-none"
                variant="brand"
              >
                Default
              </Badge>
            ) : templateSource === "whitelisted" ? (
              <Badge
                className="h-7 w-auto flex-none"
                variant="neutral"
              >
                Shared With You
              </Badge>
            ) : null}
            <Badge
              className="h-7 w-auto flex-none"
              variant="neutral"
              avatar={false}
            >
              {authorName}
            </Badge>
            <Badge
              className="h-7 w-auto flex-none"
              variant="neutral"
              icon={<FeatherGitBranch />}
              iconRight={null}
            >
              v{String(metadata?.version || "0.1")}
            </Badge>
          </>
        }
        controls={
          <div className="flex w-full items-end gap-3 mobile:flex-col mobile:items-stretch">
            <DeploymentNetworkSelect
              chains={supportedChains}
              selectedChainId={selectedChainId}
              onSelect={setSelectedChainId}
            />
            <Segment
              className="w-[520px] flex-none mobile:w-full"
              items={
                <>
                  <Segment.Item
                    icon={<FeatherFileText />}
                    active={tab === "document"}
                    onClick={() => setTab("document")}
                  >
                    Document
                  </Segment.Item>
                  <Segment.Item
                    icon={<FeatherWorkflow />}
                    active={tab === "stateMachine"}
                    onClick={() => setTab("stateMachine")}
                  >
                    State Machine Map
                  </Segment.Item>
                </>
              }
            />
          </div>
        }
      />

      {draftError && (
        <div className="w-full max-w-[1280px] px-6 relative z-10">
          <div className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {draftError}
          </div>
        </div>
      )}

      {/* Body */}
      <div className={`flex w-full grow shrink-0 basis-0 flex-col items-center gap-6 overflow-hidden px-6 py-8 relative mobile:px-4 mobile:py-4 ${tab === "document" ? "overflow-y-auto" : ""}`}>
        {!templateId ? (
          <div className="text-body font-body text-subtext-color">Missing template id.</div>
        ) : isTemplateLoading ? (
          <div className="w-full max-w-[1280px] rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-body font-body text-subtext-color">
            Loading template...
          </div>
        ) : templateErrorMessage ? (
          <div className="w-full max-w-[1280px] rounded-lg border border-red-200 bg-red-50 px-6 py-6">
            <div className="text-body font-body text-red-700">
              Failed to load template: {templateErrorMessage}
            </div>
            <div className="mt-4">
              <Button variant="neutral-secondary" onClick={() => refetchTemplate()}>
                Retry
              </Button>
            </div>
          </div>
        ) : !template ? (
          <div className="text-body font-body text-subtext-color">Template not found.</div>
        ) : tab === "document" ? (
          <div className="flex w-full max-w-[1280px] flex-col items-start gap-6 rounded-lg border border-solid border-neutral-border bg-default-background px-6 py-6 shadow-sm">
            {previewMarkdown ? (
              <div className="w-full">
                <ReactMarkdown components={previewComponents} rehypePlugins={[rehypeRaw]}>
                  {previewMarkdown}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="text-body font-body text-subtext-color">No document content found.</div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-[1280px] flex-1 min-h-0">
            <StateMachineFlowViewer
              className="h-full"
              agreementJson={template}
              currentState={null}
              initialState={null}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplatePreview;
