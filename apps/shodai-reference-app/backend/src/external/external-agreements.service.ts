import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { StandaloneConfigService } from '../config/standalone-config.service';
import { AgreementRepository } from '../database/repositories/agreement.repository';
import { AgreementInputRepository } from '../database/repositories/agreement-input.repository';
import { ExternalApiEventRepository } from '../database/repositories/external-api-event.repository';
import { getTemplateId, initialState, nextState, normalizeAddress, normalizeEmail, refreshDerivedFields } from '../agreements/agreement-utils';
import type { AgreementTransitionedWebhookEvent } from '@cns-labs/agreements-api-client/webhooks';
import type { ApiClient, AgreementInputRecord } from '@cns-labs/agreements-api-client';

type AgreementsApiClientModule = typeof import('@cns-labs/agreements-api-client');

const importAgreementsApiClientModule = new Function(
  'specifier',
  'return import(specifier)',
) as (specifier: string) => Promise<AgreementsApiClientModule>;

type InputListingResult = {
  inputs: AgreementInputRecord[];
  pageCount: number;
};

function inputListingAuditMetadata(result: InputListingResult): Record<string, unknown> {
  return {
    inputCount: result.inputs.length,
    pageCount: result.pageCount,
  };
}

@Injectable()
export class ExternalAgreementsService {
  constructor(
    private readonly config: StandaloneConfigService,
    private readonly agreements: AgreementRepository,
    private readonly inputs: AgreementInputRepository,
    private readonly externalEvents: ExternalApiEventRepository,
  ) {}

  async validateAgreementTemplate(agreement: any) {
    if (this.config.externalApiBaseUrl === 'mock') {
      return {
        templateId: getTemplateId(agreement) || null,
        participantVariableKeys: this.getParticipantVariableKeys(agreement),
        inputIds: Object.keys(agreement?.execution?.inputs || {}),
        stateIds: Object.keys(agreement?.execution?.states || {}),
        warnings: [],
      };
    }
    return this.externalApiCall(
      'validate-template',
      '/v0/agreements/validate-template',
      async () => (await this.externalApiClient()).validateTemplate(agreement || {}),
    );
  }

  async validateDirectAgreement(body: any) {
    const payload = this.directAgreementPayload({
      ...body,
      chainId: this.getAgreementChainId(body),
    });
    if (this.config.externalApiBaseUrl === 'mock') {
      return {
        templateId: getTemplateId(payload.agreement) || null,
        participantVariableKeys: this.getParticipantVariableKeys(payload.agreement),
        participants: payload.participants,
        observers: payload.observers?.map((observer: any) => normalizeEmail(String(observer || ''))).filter(Boolean) || [],
        variables: {
          ...(payload.initValues || {}),
          ...Object.fromEntries((payload.participants || [])
            .filter((participant: any) => participant.variableKey && participant.walletAddress)
            .map((participant: any) => [participant.variableKey, normalizeAddress(participant.walletAddress)])),
        },
        contributors: (payload.participants || []).map((participant: any) => normalizeAddress(participant.walletAddress)).filter(Boolean),
        warnings: [],
      };
    }
    return this.externalApiCall(
      'validate-deployment',
      '/v0/agreements/validate',
      async () => (await this.externalApiClient()).validateDeployment(payload),
    );
  }

  async deployWithPermit(id: string, body: any, user: any) {
    const agreement = await this.getReadableAgreement(id, user);
    if (agreement.status !== 'Draft') throw new ConflictException('Agreement is already deployed');
    this.assertPermitSignerAuthorized(body.signer, user);
    const signedDocUri = this.getPermitDocUri(body.docUri, agreement.docUri, agreement.json);

    const directPayload = this.directAgreementPayload({
      agreement: agreement.json,
      chainId: this.getAgreementChainId(agreement),
      displayName: agreement.displayName,
      docUri: signedDocUri,
      initValues: agreement.variables || {},
      participants: (agreement.participants || []).map(({ status, ...entry }: any) => entry),
      observers: agreement.observers || [],
      signer: body.signer,
      deadline: body.deadline,
      signature: body.signature,
    });

    const isMockExternal = this.config.externalApiBaseUrl === 'mock';
    const externalValidation: any = isMockExternal
      ? null
      : await this.externalApiCall(
        'validate-deployment',
        '/v0/agreements/validate',
        async () => (await this.externalApiClient()).validateDeployment({
          agreement: directPayload.agreement,
          chainId: directPayload.chainId,
          initValues: directPayload.initValues,
          participants: directPayload.participants,
          observers: directPayload.observers,
        }),
        { agreementId: agreement.id },
      );
    const externalRecord: any = isMockExternal
      ? this.mockDeployResult(agreement)
      : await this.externalApiCall(
        'deploy-with-permit',
        '/v0/agreements/deploy-with-permit',
        async () => (await this.externalApiClient()).deployWithPermit(directPayload as any),
        { agreementId: agreement.id },
      );
    const externalIdentifier = externalRecord.address || externalRecord.id;
    if (!externalIdentifier) {
      throw new InternalServerErrorException('External API deploy response did not include an agreement id or address');
    }

    const now = new Date().toISOString();
    Object.assign(agreement, {
      externalAgreementId: externalRecord.id || agreement.externalAgreementId,
      address: externalIdentifier,
      status: 'Deployed',
      chainId: externalRecord.chainId || directPayload.chainId,
      docUri: externalRecord.docUri || directPayload.docUri,
      state: externalRecord.state || agreement.state || initialState(agreement.json),
      onChain: externalRecord.onChain || { owner: normalizeAddress(body.signer), mock: isMockExternal },
      variables: externalRecord.variables || externalValidation?.variables || agreement.variables || {},
      participants: externalRecord.participants || agreement.participants,
      observers: externalRecord.observers || agreement.observers || [],
      updatedAt: now,
    });
    refreshDerivedFields(agreement, [normalizeAddress(body.signer)]);
    await this.agreements.upsertOne({ id: agreement.id }, agreement);
    return agreement;
  }

  async submitInput(id: string, body: any, user: any) {
    const agreement = await this.getReadableAgreement(id, user);
    if (agreement.status !== 'Deployed') throw new ConflictException('Cannot submit inputs to a Draft agreement. Deploy it first.');
    this.assertPermitSignerAuthorized(body.signer, user);

    const externalAgreementId = agreement.externalAgreementId || agreement.id;
    const previousState = agreement.state;
    let externalStateAfterInput: any = null;
    const inputRecord: any = this.config.externalApiBaseUrl === 'mock'
      ? this.mockInputResult(agreement, body, user)
      : await this.externalApiCall(
        'submit-input',
        `/v0/agreements/${encodeURIComponent(externalAgreementId)}/input`,
        async () => (await this.externalApiClient()).submitAgreementInput(externalAgreementId, body),
        { agreementId: agreement.id, externalAgreementId },
      );

    const isMockExternal = this.config.externalApiBaseUrl === 'mock';
    if (!isMockExternal) {
      externalStateAfterInput = await this.externalApiCall(
        'read-state-after-input',
        `/v0/agreements/${encodeURIComponent(externalAgreementId)}/state`,
        async () => (await this.externalApiClient()).getAgreementState(externalAgreementId),
        { agreementId: agreement.id, externalAgreementId },
      );
      if (!externalStateAfterInput?.state) {
        throw new InternalServerErrorException('External API state response did not include a state after input submission');
      }
    }

    await this.upsertInputMirror(inputRecord, agreement);
    agreement.variables = { ...(agreement.variables || {}), ...(body.values || {}) };
    agreement.lastInputId = inputRecord.inputId;
    agreement.lastInputAt = inputRecord.createdAt;
    agreement.state = isMockExternal
      ? nextState(agreement.json, previousState, inputRecord.inputId) || previousState || initialState(agreement.json)
      : externalStateAfterInput.state;
    refreshDerivedFields(agreement, [normalizeAddress(body.signer)]);
    agreement.updatedAt = new Date().toISOString();
    await this.agreements.upsertOne({ id: agreement.id }, agreement);
    return inputRecord;
  }

  async reconcileAgreementMirrorFromWebhook(agreement: any, event: AgreementTransitionedWebhookEvent) {
    const externalAgreementId = event.data.agreementId;
    const metadata = { agreementId: agreement.id, externalAgreementId, webhookEventId: event.id };
    let externalRecord: any = null;
    let externalState: any = null;
    let externalInputs: any[] = [];
    let externalInputPageCount = 0;

    if (this.config.externalApiBaseUrl === 'mock') {
      externalState = { status: agreement.status || 'Deployed', state: event.data.toState };
    } else {
      const client = await this.externalApiClient();
      externalRecord = await this.externalApiCall(
        'webhook-read-agreement',
        `/v0/agreements/${encodeURIComponent(externalAgreementId)}`,
        () => client.getAgreement(externalAgreementId),
        metadata,
      );
      externalState = await this.externalApiCall(
        'webhook-read-state',
        `/v0/agreements/${encodeURIComponent(externalAgreementId)}/state`,
        () => client.getAgreementState(externalAgreementId),
        metadata,
      );
      externalInputs = await this.externalApiCall(
        'webhook-list-inputs',
        `/v0/agreements/${encodeURIComponent(externalAgreementId)}/inputs`,
        () => this.listAllExternalInputs(client, externalAgreementId),
        metadata,
        inputListingAuditMetadata,
      ).then((result) => {
        externalInputPageCount = result.pageCount;
        return result.inputs;
      });
    }

    await Promise.all(externalInputs.map((input) => this.upsertInputMirror(input, agreement)));
    const sortedInputs = [...externalInputs].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    const latestInput = sortedInputs.at(-1);
    const inputVariables = Object.assign({}, ...sortedInputs.map((input) => input.values || {}));
    const now = new Date().toISOString();

    Object.assign(agreement, {
      externalAgreementId: externalRecord?.id || externalAgreementId || agreement.externalAgreementId,
      address: externalRecord?.address || agreement.address,
      status: externalRecord?.status || externalState?.status || agreement.status || 'Deployed',
      chainId: externalRecord?.chainId || agreement.chainId,
      docUri: externalRecord?.docUri || agreement.docUri,
      displayName: externalRecord?.displayName || agreement.displayName,
      state: externalState?.state || externalRecord?.state || event.data.toState || agreement.state,
      onChain: externalRecord?.onChain || agreement.onChain,
      variables: {
        ...(agreement.variables || {}),
        ...(externalRecord?.variables || {}),
        ...inputVariables,
      },
      participants: externalRecord?.participants || agreement.participants || [],
      observers: externalRecord?.observers || agreement.observers || [],
      lastInputId: event.data.inputId || latestInput?.inputId || agreement.lastInputId,
      lastInputAt: latestInput?.createdAt || agreement.lastInputAt,
      lastWebhookEventId: event.id,
      lastWebhookEventAt: event.createdAt,
      lastWebhookEventType: event.type,
      updatedAt: now,
    });
    refreshDerivedFields(agreement);
    await this.agreements.upsertOne({ id: agreement.id }, agreement);

    return {
      state: agreement.state,
      inputCount: externalInputs.length,
      inputPageCount: externalInputPageCount,
      latestInputId: latestInput?.inputId || null,
    };
  }

  async readState(id: string, user: any) {
    const agreement = await this.getReadableAgreement(id, user);
    if (agreement.status !== 'Deployed') return { status: agreement.status, state: agreement.state || null };
    if (this.config.externalApiBaseUrl === 'mock') return { status: agreement.status, state: agreement.state || null };
    const externalAgreementId = agreement.externalAgreementId || agreement.id;
    const external: any = await this.externalApiCall(
      'read-state',
      `/v0/agreements/${encodeURIComponent(externalAgreementId)}/state`,
      async () => (await this.externalApiClient()).getAgreementState(externalAgreementId),
      { agreementId: agreement.id, externalAgreementId },
    );
    agreement.state = external.state || agreement.state;
    agreement.status = external.status || agreement.status;
    agreement.updatedAt = new Date().toISOString();
    await this.agreements.upsertOne({ id: agreement.id }, agreement);
    return external;
  }

  async listInputs(id: string, user: any, userId?: string | null) {
    const agreement = await this.getReadableAgreement(id, user);
    if (agreement.status === 'Deployed' && this.config.externalApiBaseUrl !== 'mock') {
      const externalInputs = await this.externalApiCall(
        'list-inputs',
        `/v0/agreements/${encodeURIComponent(agreement.externalAgreementId || agreement.id)}/inputs`,
        async () => this.listAllExternalInputs(
          await this.externalApiClient(),
          agreement.externalAgreementId || agreement.id,
          userId ? { userId } : undefined,
        ),
        { agreementId: agreement.id, externalAgreementId: agreement.externalAgreementId || agreement.id },
        inputListingAuditMetadata,
      ).then((result) => result.inputs);
      await Promise.all(externalInputs.map((input) => this.upsertInputMirror(input, agreement)));
      return externalInputs;
    }
    return (await this.inputs.find({ agreementAddress: agreement.address || agreement.id }))
      .filter((entry) => !userId || entry.userId === userId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  private getPermitDocUri(bodyDocUri: unknown, agreementDocUri: unknown, agreementJson: any) {
    const bodyValue = typeof bodyDocUri === 'string' && bodyDocUri.trim() ? bodyDocUri : undefined;
    if (bodyValue) return bodyValue;
    const storedValue = typeof agreementDocUri === 'string' && agreementDocUri.trim() ? agreementDocUri : undefined;
    if (storedValue) return storedValue;
    const metadataId = agreementJson?.metadata?.id;
    return metadataId === undefined || metadataId === null ? undefined : `ipfs://agreement/${metadataId}`;
  }

  private directAgreementPayload(body: any) {
    return {
      agreement: body?.agreement || {},
      displayName: body?.displayName,
      chainId: body?.chainId,
      docUri: body?.docUri,
      initValues: body?.initValues || {},
      participants: Array.isArray(body?.participants) ? body.participants : [],
      observers: Array.isArray(body?.observers) ? body.observers : [],
      signer: body?.signer,
      deadline: body?.deadline,
      signature: body?.signature,
    };
  }

  private async upsertInputMirror(inputRecord: any, agreement: any) {
    const mirrored = {
      ...inputRecord,
      agreementAddress: inputRecord.agreementAddress || agreement.address || agreement.externalAgreementId || agreement.id,
      agreementId: agreement.id,
      chainId: inputRecord.chainId || agreement.chainId || this.config.defaultAgreementChainId,
      values: inputRecord.values || {},
      createdAt: inputRecord.createdAt || new Date().toISOString(),
      updatedAt: inputRecord.updatedAt || new Date().toISOString(),
    };
    const key = mirrored.txHash
      ? { txHash: mirrored.txHash }
      : { agreementId: agreement.id, inputId: mirrored.inputId, createdAt: mirrored.createdAt };
    await this.inputs.upsertOne(key, mirrored);
  }

  private getParticipantVariableKeys(agreement: any) {
    const variables = agreement?.variables || agreement?.fields || {};
    return Object.entries(variables)
      .filter(([, value]: any) => value?.subtype === 'participant' || value?.type === 'participant')
      .map(([key]) => key);
  }

  private async getReadableAgreement(id: string, user: any) {
    const normalizedLookupAddress = normalizeAddress(id);
    const agreement = (await this.agreements.findOne({ id })) ||
      (await this.agreements.findOne({ address: id })) ||
      (normalizedLookupAddress ? await this.agreements.findOne({ address: normalizedLookupAddress }) : null);
    if (!agreement) throw new ForbiddenException('Agreement not found');
    const walletAddresses = user.wallets?.map((wallet: any) => normalizeAddress(wallet.address)).filter(Boolean) || [];
    const email = normalizeEmail(user.email || '');
    const canRead = walletAddresses.some((wallet) => wallet && (wallet === agreement.owner || (agreement.contributors || []).includes(wallet)))
      || (email && (agreement.observers || []).includes(email))
      || (email && (agreement.participants || []).some((entry: any) => normalizeEmail(entry.email || '') === email));
    if (!canRead) throw new ForbiddenException('You do not have access to this agreement');
    return agreement;
  }

  private assertPermitSignerAuthorized(signer: string, user: any) {
    const normalizedSigner = normalizeAddress(signer);
    const wallets = [
      ...(user.wallets?.map((wallet: any) => normalizeAddress(wallet.address)) || []),
      ...(this.config.nodeEnv === 'test'
        ? String(process.env.AGREEMENTS_E2E_ADDITIONAL_WALLETS || '').split(',').map((entry) => normalizeAddress(entry)).filter(Boolean)
        : []),
    ];
    if (!normalizedSigner || !wallets.includes(normalizedSigner)) throw new UnauthorizedException('Authenticated wallet address is required');
  }

  private async externalApiClient(): Promise<ApiClient> {
    if (!this.config.externalApiBaseUrl || !this.config.externalApiKey) {
      throw new InternalServerErrorException('EXTERNAL_API_BASE_URL and EXTERNAL_API_KEY are required for deployed agreement operations');
    }
    const { ApiClient } = await importAgreementsApiClientModule('@cns-labs/agreements-api-client');
    return new ApiClient({
      baseUrl: this.config.externalApiBaseUrl,
      apiKey: this.config.externalApiKey,
    });
  }

  private async listAllExternalInputs(
    client: ApiClient,
    agreementId: string,
    params: { userId?: string } = {},
  ): Promise<InputListingResult> {
    const inputs: AgreementInputRecord[] = [];
    let cursor: string | undefined;
    let pageCount = 0;

    do {
      const page = await client.listAgreementInputs(agreementId, {
        ...params,
        ...(cursor ? { cursor } : {}),
      });
      pageCount += 1;
      inputs.push(...(Array.isArray(page.data) ? page.data : []));
      cursor = page.pageInfo?.nextCursor || undefined;
    } while (cursor);

    return { inputs, pageCount };
  }

  private async externalApiCall<T>(
    operation: string,
    apiPath: string,
    call: () => Promise<T>,
    metadata: Record<string, unknown> = {},
    resultMetadata: (result: T) => Record<string, unknown> = () => ({}),
  ): Promise<T> {
    const event = {
      id: randomUUID(),
      type: 'external_api_request',
      operation,
      path: apiPath,
      mock: false,
      createdAt: new Date().toISOString(),
      ...metadata,
    };
    try {
      const result = await call();
      await this.externalEvents.insertOne({ ...event, ...resultMetadata(result), ok: true });
      return result;
    } catch (error: any) {
      await this.externalEvents.insertOne({ ...event, error: error?.message || String(error) });
      if (typeof error?.status === 'number') {
        throw new HttpException(error?.message || 'External API request failed', error.status);
      }
      throw error;
    }
  }

  private mockDeployResult(agreement: any) {
    if (this.config.nodeEnv !== 'test') {
      throw new InternalServerErrorException('Mock external API is disabled outside tests');
    }
    return {
      id: agreement.id,
      address: this.deterministicAddress(`deploy:${agreement.id}`),
      chainId: agreement.chainId || this.config.defaultAgreementChainId,
      status: 'Deployed',
      state: initialState(agreement.json),
      variables: agreement.variables || {},
    };
  }

  private mockInputResult(agreement: any, body: any, user: any) {
    if (this.config.nodeEnv !== 'test') {
      throw new InternalServerErrorException('Mock external API is disabled outside tests');
    }
    return {
      agreementAddress: agreement.address || agreement.id,
      chainId: agreement.chainId || this.config.defaultAgreementChainId,
      inputId: body.inputId,
      userId: user.platformUserId,
      txHash: `0x${createHash('sha256').update(`${agreement.id}:${body.inputId}:${Date.now()}`).digest('hex')}`,
      blockNumber: undefined,
      payload: '0x',
      values: body.values || {},
      status: 'MINED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private deterministicAddress(seed: string) {
    return `0x${createHash('sha256').update(seed).digest('hex').slice(0, 40)}`;
  }

  private getAgreementChainId(source: any) {
    try {
      return this.config.normalizeAgreementChainId(source?.chainId);
    } catch {
      const supported = this.config.getSupportedAgreementChains().map((chain) => chain.chainId).join(', ');
      throw new BadRequestException(`Unsupported chainId. Supported chain IDs: ${supported}`);
    }
  }
}
