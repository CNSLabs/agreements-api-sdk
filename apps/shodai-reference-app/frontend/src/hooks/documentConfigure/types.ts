export type DeployValidationError = {
  /** 'form' = fixable field errors (show Review Now); 'permission' | 'unexpected' = no action button */
  type: "form" | "permission" | "unexpected";
  errorCount: number;
  title: string;
  description: string;
  showReviewButton: boolean;
};

export type DocumentVariable = {
  type: "string" | "number" | "uint256" | "boolean" | "bool" | "address" | "dateTime" | "signature" | "txHash";
  subType?:
    | "longText"
    | "participant"
    | "signature"
    | "markdown"
    | "caip2Chain"
    | "caip10Account"
    | "caip19Asset"
    | string;
  name: string;
  description?: string;
  validation?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
};

export type ParticipantFormEntry = {
  firstName: string;
  lastName: string;
  email: string;
};

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface DocumentConfigureViewModel {
  agreementName: string;
  onNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNameBlur: () => void;
  participantKeys: string[];
  participantsMap: Record<string, ParticipantFormEntry>;
  nonParticipantKeys: string[];
  variables: Record<string, DocumentVariable>;
  participantInputs: Record<string, { inputId: string; label: string }[]>;
  participantErrors: Record<string, { firstName?: string; lastName?: string; email?: string }>;
  touchedParticipantFields: Record<string, { firstName?: boolean; lastName?: boolean; email?: boolean }>;
  touchedInitFields: Record<string, boolean>;
  initFieldErrors: Record<string, string | null>;
  initValuesMap: Record<string, string>;
  createParticipantFieldHandler: (
    variableKey: string,
    field: keyof ParticipantFormEntry
  ) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  createParticipantFieldBlurHandler: (variableKey: string, field: keyof ParticipantFormEntry) => () => void;
  createVariableFieldHandler: (fieldKey: string) => (value: string) => void;
  createVariableFieldBlurHandler: (fieldKey: string) => () => void;
  observersInput: string;
  onObserversInputChange: (value: string) => void;
  onSaveObservers: () => void;
  observerError: string | null;
  canClickDeploy: boolean;
  isWorking: boolean;
  isDraft: boolean;
  onDeployClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Returns validation error to show above deploy button, or null if valid. */
  getDeployValidationError: () => DeployValidationError | null;
  saveStatus: SaveStatus;
  participantSaveStatus: SaveStatus;
  observersSaveStatus: SaveStatus;
}
