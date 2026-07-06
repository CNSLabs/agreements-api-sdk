import * as React from "react";
import StateMachineFlowViewer from "@/components/StateMachineFlowViewer";
import type { AgreementJson } from "@shodai-network/agreements-protocol-evm";

export interface AgreementStateMachineTabProps {
  agreementJson: AgreementJson;
  currentState: string | null;
}

export function AgreementStateMachineTab({ agreementJson, currentState }: AgreementStateMachineTabProps) {
  const initialState = (agreementJson as any)?.execution?.initialize?.initialState ?? null;

  return (
    <StateMachineFlowViewer
      agreementJson={agreementJson}
      currentState={currentState}
      initialState={initialState}
    />
  );
}
