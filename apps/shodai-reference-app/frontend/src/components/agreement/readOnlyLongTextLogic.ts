export interface ReadOnlyLongTextVariable {
  type?: string;
  subType?: string;
}

export interface FindCollapsedReadOnlyLongTextParams {
  text: string;
  fits: (candidate: string) => boolean;
  collapsedSuffix?: string;
}

export interface FindCollapsedReadOnlyLongTextResult {
  collapsedText: string;
  isCollapsed: boolean;
}

export const COLLAPSED_READ_ONLY_LONGTEXT_LABEL = "… show more";
export const EXPANDED_READ_ONLY_LONGTEXT_LABEL = "Show less";

export function isReadOnlyLongTextVariable(variable: ReadOnlyLongTextVariable | null | undefined): boolean {
  return variable?.type === "string" && String(variable?.subType || "").toLowerCase() === "longtext";
}

function buildCollapsedCandidate(text: string, endIndex: number, collapsedSuffix: string): string {
  const prefix = text.slice(0, endIndex).replace(/\s+$/g, "");
  return `${prefix}${collapsedSuffix}`;
}

function findWordBoundary(text: string, endIndex: number): number {
  for (let cursor = endIndex; cursor > 0; cursor -= 1) {
    if (/\s/.test(text[cursor - 1] || "")) {
      return cursor - 1;
    }
  }

  return endIndex;
}

export function findCollapsedReadOnlyLongText(
  params: FindCollapsedReadOnlyLongTextParams,
): FindCollapsedReadOnlyLongTextResult {
  const { text, fits, collapsedSuffix = COLLAPSED_READ_ONLY_LONGTEXT_LABEL } = params;

  if (text.length === 0 || fits(text)) {
    return {
      collapsedText: text,
      isCollapsed: false,
    };
  }

  let low = 0;
  let high = text.length;
  let bestIndex = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = buildCollapsedCandidate(text, mid, collapsedSuffix);

    if (fits(candidate)) {
      bestIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const wordBoundaryIndex = findWordBoundary(text, bestIndex);
  const preferredCandidate =
    wordBoundaryIndex > 0 ? buildCollapsedCandidate(text, wordBoundaryIndex, collapsedSuffix) : "";

  if (preferredCandidate && fits(preferredCandidate)) {
    return {
      collapsedText: preferredCandidate,
      isCollapsed: true,
    };
  }

  return {
    collapsedText: buildCollapsedCandidate(text, bestIndex, collapsedSuffix),
    isCollapsed: true,
  };
}
