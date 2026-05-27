/**
 * EIP-712 permit signing helpers using `@cns-labs/agreements-protocol-evm` + `viem`,
 * matching the Agreements API playground deploy and input flows.
 */

import {
  AgreementEngine,
  AgreementFactory,
  getFactoryConfigByChainId,
  type AgreementJson,
  type CreateAgreementOptions,
  type InitValue,
} from '@cns-labs/agreements-protocol-evm';
import type { Address, Hex, PublicClient, WalletClient } from 'viem';

import type { ApiClient } from './client.js';
import type {
  AgreementInputRecord,
  AgreementRecord,
  DirectDeployAgreementWithPermitRequest,
  DirectParticipantRecord,
  ProcessInputRequest,
} from './types.js';

export type SignDeployPermitParams = {
  walletClient: WalletClient;
  publicClient: PublicClient;
  /**
   * Optional expected signing chain. When provided, the public client chain must match it.
   */
  chainId?: number;
  agreement: AgreementJson;
  /** Unix seconds (e.g. `Math.floor(Date.now() / 1000) + 3600`). */
  deadline: number;
  /** Passed through to `AgreementFactory.createPermitSignature` (docUri, initValues). */
  permitOptions?: CreateAgreementOptions;
};

export type SignDeployPermitResult = {
  signature: DirectDeployAgreementWithPermitRequest['signature'];
  signerAddress: Hex;
  deadline: number;
};

export type SignInputPermitParams = {
  walletClient: WalletClient;
  publicClient: PublicClient;
  /**
   * Expected deployed agreement chain. The public client chain must match it.
   */
  chainId: number;
  agreementContractAddress: Hex;
  agreement: AgreementJson;
  inputId: string;
  values: Record<string, unknown>;
  deadline: number;
};

export type SignInputPermitResult = {
  signature: ProcessInputRequest['signature'];
  signerAddress: Hex;
  deadline: number;
};

/** Default permit lifetime used in the Agreements API playground (1 hour). */
export const DEFAULT_PERMIT_DEADLINE_SECONDS = 3600;

export function computeDefaultDeadlineSeconds(offsetSeconds: number = DEFAULT_PERMIT_DEADLINE_SECONDS): number {
  return Math.floor(Date.now() / 1000) + offsetSeconds;
}

/**
 * Sign the factory `deploy-with-permit` EIP-712 payload for inline BYOT agreement JSON.
 */
export async function signDeployWithPermit(params: SignDeployPermitParams): Promise<SignDeployPermitResult> {
  const chainId = await resolveSigningChainId(params.publicClient, params.chainId);
  const factoryConfig = getFactoryConfigByChainId(chainId);
  if (!factoryConfig) {
    throw new Error(`No AgreementFactory deployment registered for chain ${chainId}.`);
  }

  const factory = new AgreementFactory(factoryConfig, {
    publicClient: params.publicClient as never,
    walletClient: params.walletClient as never,
  });

  const { signature, signerAddress } = await factory.createPermitSignature(
    params.walletClient as never,
    params.agreement,
    params.deadline,
    params.permitOptions,
  );

  return {
    signature,
    signerAddress,
    deadline: params.deadline,
  };
}

/**
 * Sign the engine `PermitInput` EIP-712 payload for a single DFSM input.
 */
export async function signAgreementInputPermit(params: SignInputPermitParams): Promise<SignInputPermitResult> {
  await resolveSigningChainId(params.publicClient, params.chainId);

  const engine = new AgreementEngine(
    params.agreementContractAddress,
    params.publicClient as never,
    params.walletClient as never,
  );

  const { signature, signerAddress } = await engine.createPermitSignature(
    params.walletClient as never,
    params.agreement,
    params.inputId,
    params.values,
    params.deadline,
  );

  return {
    signature,
    signerAddress,
    deadline: params.deadline,
  };
}

export type DeployWithPermitCallParams = {
  client: ApiClient;
  walletClient: WalletClient;
  publicClient: PublicClient;
  chainId?: number;
  agreement: AgreementJson;
  displayName: string;
  initValues?: Record<string, InitValue>;
  participants?: DirectParticipantRecord[];
  observers?: string[];
  docUri?: string;
  deadline?: number;
  /**
   * Extra options passed to `AgreementFactory.createPermitSignature`.
   * Top-level `docUri` / `initValues` win over the same keys here; the merged values are signed and sent in the POST body.
   */
  permitOptions?: CreateAgreementOptions;
};

/**
 * Sign then `POST /agreements/deploy-with-permit` (same order as the playground).
 */
export async function deployAgreementWithPermit(
  params: DeployWithPermitCallParams,
): Promise<AgreementRecord> {
  const deadline = params.deadline ?? computeDefaultDeadlineSeconds();
  const chainId = await resolveSigningChainId(params.publicClient, params.chainId);

  const docUriRaw = params.docUri ?? params.permitOptions?.docUri;
  const docUri = docUriRaw !== undefined && docUriRaw !== '' ? docUriRaw : undefined;
  const initValues = params.initValues ?? params.permitOptions?.initValues;

  const permitOptionsForSign: CreateAgreementOptions | undefined =
    params.permitOptions === undefined && docUri === undefined && initValues === undefined
      ? undefined
      : {
          ...params.permitOptions,
          ...(docUri !== undefined ? { docUri } : {}),
          ...(initValues !== undefined ? { initValues } : {}),
        };

  const { signature, signerAddress } = await signDeployWithPermit({
    walletClient: params.walletClient,
    publicClient: params.publicClient,
    chainId,
    agreement: params.agreement,
    deadline,
    permitOptions: permitOptionsForSign,
  });

  const body: DirectDeployAgreementWithPermitRequest = {
    agreement: params.agreement as unknown as Record<string, unknown>,
    displayName: params.displayName,
    chainId,
    participants: params.participants,
    observers: params.observers,
    signer: signerAddress,
    deadline,
    signature,
    ...(initValues !== undefined ? { initValues } : {}),
    ...(docUri !== undefined ? { docUri } : {}),
  };

  return params.client.deployWithPermit(body);
}

async function resolveSigningChainId(publicClient: PublicClient, requestedChainId?: number): Promise<number> {
  const signingChainId = await publicClient.getChainId();
  if (requestedChainId !== undefined && requestedChainId !== signingChainId) {
    throw new Error(
      `Requested chainId ${requestedChainId} does not match publicClient chainId ${signingChainId}. ` +
        'Use a public client for the requested agreement chain before signing the permit.',
    );
  }
  return requestedChainId ?? signingChainId;
}

export type SubmitInputCallParams = {
  client: ApiClient;
  agreementId: string;
  walletClient: WalletClient;
  publicClient: PublicClient;
  chainId: number;
  agreementContractAddress: Address;
  agreement: AgreementJson;
  inputId: string;
  values: Record<string, unknown>;
  deadline?: number;
};

/**
 * Sign then `POST /agreements/:id/input` (same order as the playground).
 */
export async function submitAgreementInputWithPermit(
  params: SubmitInputCallParams,
): Promise<AgreementInputRecord> {
  const deadline = params.deadline ?? computeDefaultDeadlineSeconds();

  const { signature, signerAddress } = await signAgreementInputPermit({
    walletClient: params.walletClient,
    publicClient: params.publicClient,
    chainId: params.chainId,
    agreementContractAddress: params.agreementContractAddress,
    agreement: params.agreement,
    inputId: params.inputId,
    values: params.values,
    deadline,
  });

  return params.client.submitAgreementInput(params.agreementId, {
    inputId: params.inputId,
    values: params.values,
    signer: signerAddress,
    deadline,
    signature,
  });
}
