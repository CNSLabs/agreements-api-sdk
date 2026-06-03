import StateMachineFlowViewer from "@/components/StateMachineFlowViewer";
import type { AgreementJson } from "@cns-labs/agreements-protocol-evm";

export interface DocumentStateMachineTabProps {
  agreementJson: AgreementJson;
  template: { execution?: { initialize?: { initialState?: string } } } | null;
}

export function DocumentStateMachineTab({ agreementJson, template }: DocumentStateMachineTabProps) {
  const initialState = (template as any)?.execution?.initialize?.initialState ?? null;

  return (
    <div className="flex w-full grow shrink-0 basis-0 flex-col items-center px-6 py-8 min-h-0">
      <div className="flex w-full max-w-[1280px] flex-1 min-h-0">
        <StateMachineFlowViewer
          agreementJson={agreementJson}
          currentState={null}
          initialState={initialState}
          className="h-full"
        />
      </div>
    </div>
  );
}
