import * as React from "react";
import { useNavigate } from "react-router";
import { createPublicClient, encodeAbiParameters, http, isAddress, keccak256, type Hex } from "viem";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import {
  AgreementFactory,
  getFactoryConfigByChainId,
  transformAgreementToOnChainParams,
  type AgreementJson,
  type DataField,
  type InputDef,
  type Transition,
  type VerifierInit,
} from "@cns-labs/agreements-protocol-evm";
import type { UseFormReturn } from "react-hook-form";
import type { AgreementRecordApi, ParticipantApi } from "@/hooks/useAgreementsApi";
import { useAgreementsApi } from "@/hooks/useAgreementsApi";
import {
  formatDiagnosticReport,
  summarizeRecordForDiagnostic,
  summarizeTypedDataForDiagnostic,
  useWalletDiagnostics,
} from "@/hooks/useWalletDiagnostics";
import type { DocumentConfigureViewModel } from "./useDocumentConfigure";
import { isPurchaseOrderTemplate } from "@/utils/agreementsUi";
import { looksLikeEmail } from "@/utils/validation";
import { getChainConfig, getChainLabel } from "@/utils/chainConfig";

async function switchWalletToAgreementChain(
  switchChainAsync: ((args: { chainId: number }) => Promise<unknown>) | undefined,
  chainId: number,
): Promise<void> {
  const chainConfig = getChainConfig(chainId);
  if (!switchChainAsync) {
    throw new Error(`Wallet chain switching is unavailable. Please switch your wallet to ${chainConfig.chainName} (${chainId}) manually.`);
  }
  try {
    await switchChainAsync({ chainId });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : String(error);
    throw new Error(`Unable to switch wallet to ${chainConfig.chainName} (${chainId}): ${message}`);
  }
}

const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function hashInputDefs(inputDefs: InputDef[]): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: "tuple[]",
          name: "inputDefs",
          components: [
            { name: "id", type: "bytes32" },
            {
              name: "fields",
              type: "tuple[]",
              components: [
                { name: "fieldId", type: "bytes32" },
                { name: "fType", type: "uint8" },
                { name: "required", type: "bool" },
                { name: "persist", type: "bool" },
              ],
            },
            {
              name: "conditions",
              type: "tuple[]",
              components: [
                { name: "op", type: "uint8" },
                { name: "fieldId", type: "bytes32" },
                { name: "bytesArg", type: "bytes" },
              ],
            },
            { name: "verifierKeys", type: "bytes32[]" },
          ],
        },
      ],
      [
        inputDefs.map((d) => ({
          id: d.id,
          fields: d.fields.map((f) => ({
            fieldId: f.fieldId,
            fType: f.fType,
            required: f.required,
            persist: f.persist,
          })),
          conditions: d.conditions.map((c) => ({
            op: c.op,
            fieldId: c.fieldId,
            bytesArg: c.bytesArg,
          })),
          verifierKeys: d.verifierKeys,
        })),
      ]
    )
  );
}

function hashTransitions(transitions: Transition[]): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: "tuple[]",
          name: "transitions",
          components: [
            { name: "fromState", type: "bytes32" },
            { name: "toState", type: "bytes32" },
            { name: "inputId", type: "bytes32" },
          ],
        },
      ],
      [
        transitions.map((t) => ({
          fromState: t.fromState,
          toState: t.toState,
          inputId: t.inputId,
        })),
      ]
    )
  );
}

function hashInitVars(initVars: DataField[]): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: "tuple[]",
          name: "initVars",
          components: [
            { name: "id", type: "bytes32" },
            { name: "fType", type: "uint8" },
            { name: "data", type: "bytes" },
          ],
        },
      ],
      [
        initVars.map((v) => ({
          id: v.id,
          fType: v.fType,
          data: v.data,
        })),
      ]
    )
  );
}

function hashVerifiers(verifiers: VerifierInit[]): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: "tuple[]",
          name: "verifiers",
          components: [
            { name: "key", type: "bytes32" },
            { name: "verifier", type: "address" },
          ],
        },
      ],
      [
        verifiers.map((v) => ({
          key: v.key,
          verifier: v.verifier,
        })),
      ]
    )
  );
}

function hashActions(actions: Array<Record<string, unknown>>): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: "tuple[]",
          name: "actions",
          components: [
            { name: "fromState", type: "bytes32" },
            { name: "inputId", type: "bytes32" },
            { name: "target", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        },
      ],
      [
        actions.map((a) => ({
          fromState: a.fromState as Hex,
          inputId: a.inputId as Hex,
          target: a.target as Hex,
          value: a.value as bigint,
          data: a.data as Hex,
        })),
      ]
    )
  );
}

function parseVariablesRef(raw: string): { key: string; wantsValue: boolean } | null {
  const m = raw.match(/^\$\{variables\.(\w+)(?:\.(value))?\}$/);
  if (!m) return null;
  return { key: m[1], wantsValue: !!m[2] };
}

function isBlankValue(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}


function getErrorMessage(error: unknown): string {
  const err = error as any;
  const apiMessage = err?.response?.data?.message;
  if (Array.isArray(apiMessage)) return apiMessage.join(", ");
  if (typeof apiMessage === "string" && apiMessage.trim()) return apiMessage;
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  return "Deployment failed. Please try again.";
}

export type DeployConfirmDetails = {
  chainId?: number;
  chainName: string;
  needsErc20Approval: boolean;
  tokenAddress?: string;
  paymentAmount?: string;
  grantorAddress?: string;
};

type DeployAgreementResult = {
  record: AgreementRecordApi;
  erc20ApprovalWarning?: {
    diagnosticId: string;
  };
};

export interface UseDocumentDeployParams {
  draft: AgreementRecordApi | null;
  draftId: string | undefined;
  template: any;
  form: UseFormReturn<Record<string, any>>;
  initKeys: string[];
  setShowValidation: (v: boolean) => void;
  navigate: ReturnType<typeof useNavigate>;
  /** Called after setParticipants(resolveWallets) so parent can update draft state */
  onDraftUpdated?: (updated: AgreementRecordApi) => void;
}

export function useDocumentDeploy({
  draft,
  draftId,
  template,
  form,
  initKeys,
  setShowValidation,
  navigate,
  onDraftUpdated,
}: UseDocumentDeployParams) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { updateDraftValues, deployAgreementWithPermit, setParticipants } = useAgreementsApi();
  const captureDiagnostic = useWalletDiagnostics();

  const [isDeployWorking, setIsDeployWorking] = React.useState(false);
  const [deployError, setDeployError] = React.useState<string | null>(null);
  const [deployErrorReport, setDeployErrorReport] = React.useState<string | null>(null);
  const deploymentInProgressRef = React.useRef(false);

  const agreementJson = React.useMemo(() => template as unknown as AgreementJson, [template]);

  const getErc20ApprovalDetails = React.useCallback(
    (initObj: Record<string, string>): DeployConfirmDetails => {
      const actions = Array.isArray((agreementJson as any)?.execution?.actions)
        ? ((agreementJson as any).execution.actions as any[])
        : [];

      const transferFrom = actions.find(
        (a: any) =>
          a?.call?.type === "evmCall" &&
          a?.call?.method === "transferFrom" &&
          Array.isArray(a?.call?.args) &&
          a.call.args.length >= 3
      );

      if (!transferFrom) {
        return {
          needsErc20Approval: false,
          chainId: draft?.chainId,
          chainName: getChainLabel(draft?.chainId),
          tokenAddress: undefined,
          paymentAmount: undefined,
          grantorAddress: undefined,
        };
      }

      const call = transferFrom.call ?? {};
      const args: unknown[] = Array.isArray(call.args) ? call.args : [];

      const tokenRef = typeof call?.target === "string" ? parseVariablesRef(call.target) : null;
      const fromRef = typeof args?.[0] === "string" ? parseVariablesRef(String(args[0])) : null;
      const amountRef = typeof args?.[2] === "string" ? parseVariablesRef(String(args[2])) : null;

      const tokenAddress = tokenRef?.key ? initObj[tokenRef.key] : initObj.workTokenAddress;
      const grantorAddress = fromRef?.key ? initObj[fromRef.key] : initObj.grantorEthAddress;
      const paymentAmount = amountRef?.key ? initObj[amountRef.key] : initObj.paymentAmount;

      return {
        needsErc20Approval: true,
        chainId: draft?.chainId,
        chainName: getChainLabel(draft?.chainId),
        tokenAddress: tokenAddress || undefined,
        paymentAmount: paymentAmount || undefined,
        grantorAddress: grantorAddress || undefined,
      };
    },
    [agreementJson, draft?.chainId]
  );

  const getDeployConfirmDetails = React.useCallback((): DeployConfirmDetails => {
    const values = form.getValues() as Record<string, any>;
    const initObj: Record<string, string> = {};
    for (const k of initKeys) {
      const v = values?.[k];
      if (v != null && v !== "") initObj[k] = String(v);
    }
    return getErc20ApprovalDetails(initObj);
  }, [form, initKeys, getErc20ApprovalDetails]);

  const handleDeployAgreement = React.useCallback(
    async (configure: DocumentConfigureViewModel): Promise<DeployAgreementResult> => {
      let deployStage = "initial";
      let diagnosticContext: Record<string, unknown> = {
        draftId: draftId ?? null,
        draftStatus: draft?.status ?? null,
        draftOwner: draft?.owner ?? null,
        templateId: (template as any)?.metadata?.templateId || (template as any)?.metadata?.id || null,
        templateName: (template as any)?.metadata?.name ?? null,
        initKeys,
        connectedAddress: address ?? null,
        hasWalletClient: !!walletClient,
        hasPublicClient: !!publicClient,
        walletClientAccount: (walletClient as any)?.account?.address ?? null,
        walletClientChainId: (walletClient as any)?.chain?.id ?? null,
        publicClientChainId: publicClient?.chain?.id ?? null,
        participantCount: configure.participantKeys.length,
        nonParticipantCount: configure.nonParticipantKeys.length,
      };

      if (!template || !draftId || !draft) throw new Error("Missing template or draft");
      if (!publicClient) throw new Error("No public client available");
      if (!walletClient) throw new Error("Wallet not connected");
      if (!address) throw new Error("Wallet address not available");

      try {
        // Persist participants immediately before signing so the backend can resolve
        // participant wallet addresses and persist them on the draft.
        deployStage = "resolve-participants";
        let latestDraft = draft;
        if (configure.participantKeys.length > 0) {
          const participants: ParticipantApi[] = configure.participantKeys.map((k) => {
            const entry = configure.participantsMap[k] || { firstName: "", lastName: "", email: "" };
            return {
              variableKey: k,
              firstName: entry.firstName || undefined,
              lastName: entry.lastName || undefined,
              email: entry.email && looksLikeEmail(entry.email) ? entry.email : undefined,
            };
          });
          diagnosticContext = {
            ...diagnosticContext,
            participantsSummary: participants.map((participant) => ({
              variableKey: participant.variableKey,
              hasEmail: !!participant.email,
              emailDomain: participant.email?.split("@")[1] ?? null,
              hasFirstName: !!participant.firstName,
              hasLastName: !!participant.lastName,
            })),
          };
          latestDraft = await setParticipants(draftId, participants, { resolveWallets: true });
          onDraftUpdated?.(latestDraft);
        }

        // Collect init values from form.
        deployStage = "normalize-init-values";
        const values = form.getValues() as any;
        const draftValues = (latestDraft?.variables || {}) as Record<string, unknown>;
        const initObj: Record<string, string> = {};

        const templateId = (template as any)?.metadata?.templateId || (template as any)?.metadata?.id;
        const _isPurchaseOrderTemplate = isPurchaseOrderTemplate(templateId);

        for (const k of initKeys) {
          let v: unknown = values?.[k];
          if (isBlankValue(v)) v = draftValues?.[k];
          if (isBlankValue(v)) throw new Error(`Missing required init value: ${k}`);
          if (typeof v === "string") v = v.trim();

          if (_isPurchaseOrderTemplate && k === "paymentAmount") {
            try {
              const raw = String(v ?? "");
              const trimmed = raw.trim();
              if (!trimmed || trimmed === "") throw new Error("paymentAmount cannot be empty");
              const parts = trimmed.split(".");
              if (parts.length > 2) throw new Error("Invalid number format");
              const integerPart = parts[0] || "0";
              const decimalPart = parts[1] || "";
              if (integerPart && !/^\d+$/.test(integerPart)) throw new Error("Invalid number format");
              if (decimalPart && !/^\d+$/.test(decimalPart)) throw new Error("Invalid decimal format");
              if (decimalPart.length > 6) throw new Error("Payment amount cannot have more than 6 decimal places");
              const paddedDecimal = decimalPart.padEnd(6, "0");
              const amountInSmallestUnit = BigInt(integerPart) * BigInt(1_000_000) + BigInt(paddedDecimal);
              if (amountInSmallestUnit === BigInt(0)) throw new Error("paymentAmount must be greater than 0");
              v = amountInSmallestUnit.toString();
            } catch (err: any) {
              throw new Error(`Invalid paymentAmount: ${err?.message || "must be a number"}`);
            }
          }

          const varType = (template as any)?.variables?.[k]?.type;
          if (varType === "address") {
            const addr = String(v).trim();
            if (!isAddress(addr)) throw new Error(`Invalid address for ${k}`);
            v = addr;
          }
          if (varType === "dateTime" && typeof v === "string") {
            const d = new Date(v);
            if (!isNaN(d.getTime())) v = d.toISOString();
          }
          initObj[k] = String(v);
        }
        diagnosticContext = {
          ...diagnosticContext,
          initValueSummary: summarizeRecordForDiagnostic(initObj),
        };

        deployStage = "persist-draft-values";
        try {
          latestDraft = await updateDraftValues(draftId, initObj);
          onDraftUpdated?.(latestDraft);
        } catch (error: any) {
          diagnosticContext = {
            ...diagnosticContext,
            persistedDraftValues: false,
          };
          throw new Error(error?.message || "Failed to save draft values before signing. Please try again.");
        }

        const chainId = draft?.chainId;
        if (!chainId) throw new Error("Draft is missing a deploy chain");
        const selectedChain = getChainConfig(chainId);
        const currentChainId = await publicClient.getChainId();
        if (currentChainId !== chainId) {
          deployStage = "switch-wallet-chain";
          await switchWalletToAgreementChain(switchChainAsync, chainId);
        }
        const targetPublicClient = currentChainId === chainId
          ? publicClient
          : createPublicClient({
              chain: selectedChain.chain,
              transport: http(selectedChain.rpcUrl),
            });
        const factoryConfig = getFactoryConfigByChainId(chainId);
        if (!factoryConfig) throw new Error(`No factory deployment found for chainId ${chainId}`);

        const factory = new AgreementFactory(factoryConfig, {
          publicClient: targetPublicClient as any,
          walletClient: walletClient as any,
        });

        const deadline = Math.floor(Date.now() / 1000) + 60 * 60;

        deployStage = "build-deploy-permit";
        const params = transformAgreementToOnChainParams(agreementJson, undefined, initObj as any);
        const paramsWithActions = params as typeof params & { actions?: Array<Record<string, unknown>> };
        const paramsWithVerifiers = params as typeof params & { verifiers?: VerifierInit[] };
        const nonce = await factory.getNonce(address as `0x${string}`);
        const domain = {
          name: "AgreementFactory",
          version: "1",
          chainId,
          verifyingContract: factoryConfig.factoryAddress,
        } as const;
        const types = {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          PermitAgreementWithActions: [
            { name: "docUri", type: "string" },
            { name: "docHash", type: "bytes32" },
            { name: "initialState", type: "bytes32" },
            { name: "inputDefsHash", type: "bytes32" },
            { name: "transitionsHash", type: "bytes32" },
            { name: "initVarsHash", type: "bytes32" },
            { name: "verifiersHash", type: "bytes32" },
            { name: "actionsHash", type: "bytes32" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        } as const;
        const message = {
          docUri: params.docUri,
          docHash: params.docHash,
          initialState: params.initialState,
          inputDefsHash: hashInputDefs(params.inputDefs),
          transitionsHash: hashTransitions(params.transitions),
          initVarsHash: hashInitVars(params.initVars),
          verifiersHash: hashVerifiers(paramsWithVerifiers.verifiers ?? []),
          actionsHash: hashActions(paramsWithActions.actions ?? []),
          nonce: Number(nonce),
          deadline,
        } as const;
        diagnosticContext = {
          ...diagnosticContext,
          signingIntent: "deploy-agreement-with-permit",
          deploySummary: {
            factoryAddress: factoryConfig.factoryAddress,
            docHash: params.docHash,
            initialStateHash: params.initialState,
            inputDefCount: params.inputDefs.length,
            transitionCount: params.transitions.length,
            initVarCount: params.initVars.length,
            actionCount: (paramsWithActions.actions ?? []).length,
          },
          signingAttempt: summarizeTypedDataForDiagnostic({
            domain,
            primaryType: "PermitAgreementWithActions",
            types,
            message: message as unknown as Record<string, unknown>,
          }),
        };

        deployStage = "sign-deploy-permit";
        const { signature, signerAddress } = await factory.createPermitSignature(
          walletClient as any,
          agreementJson,
          deadline,
          { docUri: params.docUri, initValues: initObj as any }
        );
        diagnosticContext = {
          ...diagnosticContext,
          signatureResult: {
            signerAddress,
            deadline,
            signatureShape: {
              v: signature.v,
              rPreview: `${signature.r.slice(0, 10)}...${signature.r.slice(-6)}`,
              sPreview: `${signature.s.slice(0, 10)}...${signature.s.slice(-6)}`,
            },
          },
        };

        const approvalDetails = getErc20ApprovalDetails(initObj);
        diagnosticContext = {
          ...diagnosticContext,
          erc20ApprovalSummary: approvalDetails.needsErc20Approval
            ? {
                needsApproval: true,
                tokenAddress: approvalDetails.tokenAddress ?? null,
                grantorAddress: approvalDetails.grantorAddress ?? null,
                paymentAmountPreview: approvalDetails.paymentAmount
                  ? summarizeRecordForDiagnostic({ paymentAmount: approvalDetails.paymentAmount }).paymentAmount
                  : null,
              }
            : { needsApproval: false },
        };

        deployStage = "post-deploy-permit-to-api";
        const record = await deployAgreementWithPermit(draftId, {
          signer: signerAddress,
          deadline,
          signature,
          docUri: params.docUri,
          initValues: initObj,
        });
        const addr = record?.address || record?.id;
        if (!addr) throw new Error("API did not return an agreement address.");

        let erc20ApprovalWarning: DeployAgreementResult["erc20ApprovalWarning"];
        if (approvalDetails.needsErc20Approval) {
          deployStage = "approve-erc20";
          try {
            const tokenAddress = approvalDetails.tokenAddress;
            const grantorAddr = approvalDetails.grantorAddress;
            const rawAmount = approvalDetails.paymentAmount;

            if (!tokenAddress || !grantorAddr || !rawAmount) {
              // Missing approval details mean there is no client-side approval to submit.
            } else if (!isAddress(tokenAddress)) {
              // Invalid token metadata is ignored here and left to backend deploy validation.
            } else if (!isAddress(grantorAddr)) {
              // Invalid grantor metadata is ignored here and left to backend deploy validation.
            } else if (signerAddress.toLowerCase() !== grantorAddr.toLowerCase()) {
              // Only the grantor signs ERC20 approvals from the connected wallet.
            } else {
              let amount: bigint;
              try {
                amount = BigInt(rawAmount);
              } catch {
                throw new Error("paymentAmount must be an integer (uint256)");
              }
              const approveHash = await (walletClient as any).writeContract({
                account: (walletClient as any).account,
                address: tokenAddress,
                abi: ERC20_APPROVE_ABI,
                functionName: "approve",
                args: [addr, amount],
              });
              await (targetPublicClient as any).waitForTransactionReceipt({ hash: approveHash });
            }
          } catch (approvalError) {
            const approvalDiagnostic = captureDiagnostic({
              flow: "agreement-deploy-erc20-approval",
              stage: "approve-erc20",
              context: {
                ...diagnosticContext,
                deployedAgreementId: record.id,
                deployedAgreementAddress: record.address ?? null,
              },
              error: approvalError,
            });
            console.warn("Agreement deployed, but ERC20 approval was not completed:", approvalError);
            erc20ApprovalWarning = { diagnosticId: approvalDiagnostic.id };
          }
        }

        return { record, erc20ApprovalWarning };
      } catch (error) {
        if (error && typeof error === "object") {
          (error as any).__diagnosticStage = deployStage;
          (error as any).__diagnosticContext = diagnosticContext;
        }
        throw error;
      }
    },
    [
      address,
      agreementJson,
      captureDiagnostic,
      deployAgreementWithPermit,
      draft,
      draftId,
      form,
      getErc20ApprovalDetails,
      initKeys,
      onDraftUpdated,
      publicClient,
      setParticipants,
      switchChainAsync,
      template,
      updateDraftValues,
      walletClient,
    ]
  );

  const handleConfirmDeploy = React.useCallback(
    async (configure: DocumentConfigureViewModel) => {
      let deployStage = "initial";

      // Prevent concurrent executions - if already running, return early
      if (isDeployWorking || deploymentInProgressRef.current) return;

      // Set working state FIRST to prevent effects from running during re-render
      setIsDeployWorking(true);
      setDeployError(null);
      setDeployErrorReport(null);

      try {
        deployStage = "validate-before-submit";
        if (!configure.canClickDeploy) {
          setShowValidation(true);
          throw new Error("Cannot deploy: validation failed");
        }
        if (!draftId) throw new Error("Draft ID is missing");
        if (!address) throw new Error("Wallet address not available");

        // Set deployment flag to prevent effects from running during re-render
        deploymentInProgressRef.current = true;
        deployStage = "create-permit-and-deploy";
        const deployedResult = await handleDeployAgreement(configure);
        if (!deployedResult?.record) throw new Error("Agreement deployment failed");

        deployStage = "navigate-to-agreement";
        const nextSearchParams = new URLSearchParams({ deployed: "true" });
        if (deployedResult.erc20ApprovalWarning) {
          nextSearchParams.set("approval", "erc20-failed");
          nextSearchParams.set("approvalReference", deployedResult.erc20ApprovalWarning.diagnosticId);
        }
        navigate(`/agreement/${deployedResult.record.id}?${nextSearchParams.toString()}`);
      } catch (err: any) {
        const diagnosticReport = captureDiagnostic({
          flow: "agreement-deploy",
          stage: err?.__diagnosticStage || deployStage,
          context: err?.__diagnosticContext || {
            draftId: draftId ?? null,
            draftStatus: draft?.status ?? null,
            draftOwner: draft?.owner ?? null,
            templateId: (template as any)?.metadata?.templateId || (template as any)?.metadata?.id || null,
            templateName: (template as any)?.metadata?.name ?? null,
            initKeys,
            connectedAddress: address ?? null,
            hasWalletClient: !!walletClient,
            hasPublicClient: !!publicClient,
            participantCount: configure.participantKeys.length,
            nonParticipantCount: configure.nonParticipantKeys.length,
          },
          error: err,
        });
        console.error("Deployment failed:", err);
        setDeployError(`${getErrorMessage(err)} Reference: ${diagnosticReport.id}`);
        setDeployErrorReport(formatDiagnosticReport(diagnosticReport));
      } finally {
        setIsDeployWorking(false);
        deploymentInProgressRef.current = false;
      }
    },
    [
      address,
      captureDiagnostic,
      draft?.owner,
      draft?.status,
      draftId,
      handleDeployAgreement,
      initKeys,
      isDeployWorking,
      navigate,
      publicClient,
      setShowValidation,
      template,
      walletClient,
    ]
  );

  return {
    getDeployConfirmDetails,
    handleConfirmDeploy,
    isDeployWorking,
    deployError,
    deployErrorReport,
    setDeployError,
    setDeployErrorReport,
  };
}
