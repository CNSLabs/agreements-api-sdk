import { Badge } from "@/subframe/components/Badge";
import { IconButton } from "@/subframe/components/IconButton";
import { FeatherExternalLink } from "@subframe/core";
import { formatOnchainReferenceValue, getOnchainReferenceDetails, type OnchainReferenceVariable } from "@/utils/onchainReferences";
import { useOnchainAccountResolution } from "@/hooks/useOnchainAccountResolution";

function SafeIcon() {
  return (
    <svg
      viewBox="0 0 455.8 455.8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        fill="#12FF80"
        d="M429.1 227.8h-49.4c-14.8 0-26.7 12-26.7 26.7v71.7c0 14.8-12 26.7-26.7 26.7H129.6c-14.8 0-26.7 12-26.7 26.7v49.4c0 14.8 12 26.7 26.7 26.7h208c14.8 0 26.5-12 26.5-26.7v-39.6c0-14.8 12-25.2 26.7-25.2H429c14.8 0 26.7-12 26.7-26.7v-83.3c.1-14.8-11.9-26.4-26.6-26.4Z"
      />
      <path
        fill="#12FF80"
        d="M102.9 129.6c0-14.8 12-26.7 26.7-26.7h196.5c14.8 0 26.7-12 26.7-26.7V26.7c0-14.8-12-26.7-26.7-26.7H118.2c-14.8 0-26.7 12-26.7 26.7v38.1c0 14.8-12 26.7-26.7 26.7h-38C12 91.5 0 103.5 0 118.2v83.4c0 14.8 12 26.1 26.8 26.1h49.4c14.8 0 26.7-12 26.7-26.7v-71.4Z"
      />
      <path
        fill="#12FF80"
        d="M204.6 175.8h47.5c15.5 0 28 12.6 28 28v47.5c0 15.5-12.6 28-28 28h-47.5c-15.5 0-28-12.6-28-28v-47.5c0-15.4 12.6-28 28-28Z"
      />
    </svg>
  );
}

interface OnchainReferenceDisplayProps {
  value: unknown;
  variable?: OnchainReferenceVariable | null;
  mode?: "compact" | "inline" | "document";
  textClassName?: string;
}

export function OnchainReferenceDisplay({
  value,
  variable,
  mode = "inline",
  textClassName = "grow shrink-0 basis-0 break-words text-body font-body text-default-font",
}: OnchainReferenceDisplayProps) {
  const onchainDetails = getOnchainReferenceDetails(value, variable);
  const resolutionQuery = useOnchainAccountResolution(value, variable?.subType);

  if (!onchainDetails) return null;

  const displayValue = formatOnchainReferenceValue(value, variable, { mode });
  const isSafe = resolutionQuery.data?.accountType === "safe";

  return (
    <>
      <span className={textClassName}>{displayValue}</span>
      <Badge variant="neutral">{onchainDetails.chain.chainName}</Badge>
      {isSafe && resolutionQuery.data?.safeAppUrl ? (
        <a
          className="inline-flex h-6 w-6 items-center justify-center text-[#12FF80]"
          href={resolutionQuery.data.safeAppUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open in Safe"
          aria-label="Open in Safe"
        >
          <SafeIcon />
        </a>
      ) : null}
      {onchainDetails.explorerUrl ? (
        <IconButton
          size="small"
          icon={<FeatherExternalLink />}
          onClick={() => window.open(onchainDetails.explorerUrl, "_blank")}
          title="Open in block explorer"
        />
      ) : null}
    </>
  );
}
