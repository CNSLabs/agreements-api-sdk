import { getOnchainReferenceDetails } from "@/utils/onchainReferences";

import { getAgreementVariableRowPresentation, type AgreementVariableRowVariable } from "./agreementVariableRowPresentation";
import { AgreementValueContent } from "./AgreementValueContent";

interface AgreementVariableRowProps {
  label: string;
  value: unknown;
  variable?: AgreementVariableRowVariable | null;
}

function stringifyValue(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

export function AgreementVariableRow({ label, value, variable = null }: AgreementVariableRowProps) {
  const onchainDetails = getOnchainReferenceDetails(value, variable);
  const presentation = getAgreementVariableRowPresentation({
    rawValue: value,
    hasOnchainDetails: Boolean(onchainDetails),
    variable,
  });
  const displayValue = stringifyValue(value);

  return (
    <div className="flex w-full min-w-0 items-start justify-end gap-4 bg-default-background px-3 py-2">
      <span className="w-52 flex-none break-words text-caption font-caption text-subtext-color">{label}</span>
      <div
        className={`flex min-w-0 grow shrink-0 basis-0 ${
          presentation.branch === "markdown" || presentation.preserveWhitespace ? "items-start" : "items-center"
        } justify-end`}
      >
        <AgreementValueContent rawValue={value} displayValue={displayValue} variable={variable} shellVariant="summary" />
      </div>
    </div>
  );
}
