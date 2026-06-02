import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AgreementRepository } from '../database/repositories/agreement.repository';
import { TemplateAccessRepository } from '../database/repositories/template-access.repository';
import { PlatformUserService } from '../auth/platform-user.service';
import { TemplateCatalogService } from '../templates/template-catalog.service';
import { StandaloneConfigService } from '../config/standalone-config.service';
import {
  getParticipantVariableKeys,
  getTemplateId,
  initialState,
  normalizeAddress,
  normalizeEmail,
  normalizeEmailList,
  refreshDerivedFields,
} from './agreement-utils';

@Injectable()
export class DraftAgreementsService {
  constructor(
    private readonly agreements: AgreementRepository,
    private readonly templateAccess: TemplateAccessRepository,
    private readonly platformUsers: PlatformUserService,
    private readonly catalog: TemplateCatalogService,
    private readonly config: StandaloneConfigService,
  ) {}

  async getAvailableTemplateAccess(platformUserId: string) {
    const defaults = await this.catalog.getFrontendTemplateIds((await this.templateAccess.findOne({ kind: 'global-default' }))?.templateIds || []);
    const whitelist = await this.catalog.getFrontendTemplateIds((await this.templateAccess.findOne({ kind: 'user-whitelist', platformUserId }))?.templateIds || []);
    return { defaultTemplateIds: defaults, whitelistedTemplateIds: whitelist };
  }

  async validateAgreementTemplate(agreement: any) {
    return {
      templateId: getTemplateId(agreement) || null,
      participantVariableKeys: getParticipantVariableKeys(agreement),
      inputIds: Object.keys(agreement?.execution?.inputs || {}),
      stateIds: Object.keys(agreement?.execution?.states || {}),
      warnings: [],
    };
  }

  async validateDirectAgreement(body: any) {
    const agreement = body.agreement || {};
    const participants = body.participants || [];
    const variables = { ...(body.initValues || {}) };
    for (const participant of participants) {
      if (participant.variableKey && participant.walletAddress) variables[participant.variableKey] = normalizeAddress(participant.walletAddress);
    }
    return {
      templateId: getTemplateId(agreement) || null,
      participantVariableKeys: getParticipantVariableKeys(agreement),
      participants,
      observers: normalizeEmailList(body.observers || []),
      variables,
      contributors: Object.values(variables).filter((value) => typeof value === 'string' && value.startsWith('0x')).map((value) => normalizeAddress(String(value))),
      warnings: [],
    };
  }

  async createDraft(body: any, user: any) {
    const wallet = this.getPrimaryWallet(user);
    const agreement = body?.agreement;
    const templateId = await this.requireFrontendTemplateId(agreement);
    const catalogTemplate = await this.catalog.getTemplate(templateId);
    if (catalogTemplate.metadata?.templateId !== agreement.metadata.templateId) {
      throw new BadRequestException('Agreement template metadata must include a valid templateId');
    }
    if (!(await this.getAllowedTemplateIds(user.platformUserId)).includes(templateId)) {
      throw new ForbiddenException('You do not have access to this agreement template');
    }
    const now = new Date().toISOString();
    const chainId = this.requireSupportedChainId(body?.chainId);
    const record = this.buildAgreementRecord({
      id: randomUUID(),
      status: 'Draft',
      chainId,
      displayName: typeof body?.displayName === 'string' ? body.displayName : '',
      agreement,
      docUri: body?.docUri,
      owner: wallet,
      variables: body?.initValues || {},
      participants: [],
      observers: [],
      createdAt: now,
      updatedAt: now,
    });
    await this.agreements.insertOne(record);
    return record;
  }

  async list(user: any, status?: string | null) {
    if (status && status !== 'Draft' && status !== 'Deployed') throw new BadRequestException('Status must be "Draft" or "Deployed"');
    const walletAddresses = user.wallets?.map((wallet: any) => normalizeAddress(wallet.address)).filter(Boolean) || [];
    const email = normalizeEmail(user.email || '');
    const agreements = await this.agreements.find(status ? { status } : {});
    return agreements.filter((agreement) => this.canReadAgreement(agreement, { walletAddresses, email }));
  }

  async get(id: string, user: any) {
    const agreement = await this.findAgreement(id);
    this.assertReadAccess(agreement, user);
    return agreement;
  }

  async updateChainId(id: string, chainId: unknown, user: any) {
    const agreement = await this.getWritableDraft(id, user);
    agreement.chainId = this.requireSupportedChainId(chainId);
    this.touch(agreement);
    await this.agreements.upsertOne({ id: agreement.id }, agreement);
    return agreement;
  }

  async updateValues(id: string, values: Record<string, unknown>, user: any) {
    const agreement = await this.getWritableDraft(id, user);
    agreement.variables = { ...(agreement.variables || {}), ...(values || {}) };
    refreshDerivedFields(agreement);
    this.touch(agreement);
    await this.agreements.upsertOne({ id: agreement.id }, agreement);
    return agreement;
  }

  async updateDisplayName(id: string, displayName: string, user: any) {
    const agreement = await this.getWritableDraft(id, user);
    agreement.displayName = String(displayName || agreement.displayName);
    this.touch(agreement);
    await this.agreements.upsertOne({ id: agreement.id }, agreement);
    return agreement;
  }

  async deleteDraft(id: string, user: any) {
    const agreement = await this.getWritableDraft(id, user);
    if (agreement.status !== 'Draft') throw new ConflictException('Deployed agreements cannot be deleted');
    await this.agreements.deleteOne({ id: agreement.id });
    return { ok: true };
  }

  async getParticipants(id: string, user: any) {
    const agreement = await this.get(id, user);
    return {
      participants: agreement.participants || [],
      participantVariableKeys: getParticipantVariableKeys(agreement.json || {}),
    };
  }

  async setParticipants(id: string, body: any, user: any) {
    const agreement = await this.getWritableDraft(id, user);
    const previousParticipantVariableKeys = (agreement.participants || [])
      .map((entry: any) => String(entry.variableKey || ''))
      .filter(Boolean);
    agreement.participants = await this.maybeResolveParticipants(body?.participants || [], body?.resolveWallets === true);
    const participantVariableKeys = new Set([
      ...getParticipantVariableKeys(agreement.json || {}),
      ...previousParticipantVariableKeys,
      ...(agreement.participants || []).map((entry: any) => String(entry.variableKey || '')).filter(Boolean),
    ]);
    const retainedVariables = Object.fromEntries(Object.entries(agreement.variables || {})
      .filter(([key]) => !participantVariableKeys.has(key)));
    agreement.variables = {
      ...retainedVariables,
      ...Object.fromEntries((agreement.participants || [])
        .filter((entry: any) => entry.variableKey && entry.walletAddress)
        .map((entry: any) => [entry.variableKey, normalizeAddress(entry.walletAddress)])),
    };
    refreshDerivedFields(agreement);
    this.touch(agreement);
    await this.agreements.upsertOne({ id: agreement.id }, agreement);
    return agreement;
  }

  async getObservers(id: string, user: any) {
    const agreement = await this.get(id, user);
    return { observers: agreement.observers || [] };
  }

  async setObservers(id: string, observers: unknown, user: any) {
    const agreement = await this.getWritableDraft(id, user);
    agreement.observers = this.normalizeAndValidateEmailList(observers || [], 'observers');
    this.touch(agreement);
    await this.agreements.upsertOne({ id: agreement.id }, agreement);
    return agreement;
  }

  private async getAllowedTemplateIds(platformUserId: string) {
    const access = await this.getAvailableTemplateAccess(platformUserId);
    return [...new Set([...access.defaultTemplateIds, ...access.whitelistedTemplateIds])];
  }

  private async requireFrontendTemplateId(agreement: any) {
    const rawTemplateId = String(agreement?.metadata?.templateId || '').trim();
    if (!rawTemplateId) {
      throw new BadRequestException('Agreement template metadata must include a valid templateId');
    }
    const templateId = await this.catalog.getFrontendTemplateId(rawTemplateId);
    if (!templateId) {
      throw new BadRequestException('Agreement template metadata must include a valid templateId');
    }
    return templateId;
  }

  private async findAgreement(id: string) {
    const normalizedLookupAddress = normalizeAddress(id);
    const agreement = (await this.agreements.findOne({ id })) ||
      (normalizedLookupAddress ? await this.agreements.findOne({ address: normalizedLookupAddress }) : null);
    if (!agreement) throw new NotFoundException('Agreement not found');
    return agreement;
  }

  private async getWritableDraft(id: string, user: any) {
    const agreement = await this.findAgreement(id);
    this.assertReadAccess(agreement, user);
    if (agreement.status !== 'Draft') throw new ConflictException('Only draft agreements can be edited');
    const wallets = user.wallets?.map((wallet: any) => normalizeAddress(wallet.address)) || [];
    if (!wallets.includes(normalizeAddress(agreement.owner))) throw new ForbiddenException('Only the owner can edit this draft');
    return agreement;
  }

  private buildAgreementRecord(params: any) {
    const record = {
      id: params.id,
      address: params.address,
      status: params.status,
      chainId: params.chainId || this.config.defaultAgreementChainId,
      displayName: params.displayName,
      owner: normalizeAddress(params.owner),
      json: params.agreement,
      docUri: params.docUri,
      variables: params.variables || {},
      participants: params.participants || [],
      observers: normalizeEmailList(params.observers || []),
      state: params.state || (params.status === 'Draft' ? undefined : initialState(params.agreement)),
      onChain: params.onChain,
      createdAt: params.createdAt || new Date().toISOString(),
      updatedAt: params.updatedAt || new Date().toISOString(),
    };
    refreshDerivedFields(record);
    return record;
  }

  private assertReadAccess(agreement: any, user: any) {
    const access = {
      walletAddresses: user.wallets?.map((wallet: any) => normalizeAddress(wallet.address)).filter(Boolean) || [],
      email: normalizeEmail(user.email || ''),
    };
    if (!this.canReadAgreement(agreement, access)) throw new ForbiddenException('You do not have access to this agreement');
  }

  private canReadAgreement(agreement: any, access: { walletAddresses: string[]; email: string }) {
    return access.walletAddresses.some((wallet) => wallet && (wallet === agreement.owner || (agreement.contributors || []).includes(wallet)))
      || (access.email && (agreement.observers || []).includes(access.email))
      || (access.email && (agreement.participants || []).some((entry: any) => normalizeEmail(entry.email || '') === access.email));
  }

  private getPrimaryWallet(user: any) {
    const wallet = (user.wallets || []).find((entry: any) => normalizeAddress(entry.address));
    if (!wallet) throw new UnauthorizedException('Authenticated wallet address is required');
    return normalizeAddress(wallet.address);
  }

  private async maybeResolveParticipants(participants: any[], resolveWallets: boolean) {
    const normalized = (Array.isArray(participants) ? participants : []).map((entry) => ({
      variableKey: String(entry.variableKey || ''),
      email: entry.email ? this.normalizeAndValidateEmail(String(entry.email), 'participant email') : undefined,
      firstName: entry.firstName,
      lastName: entry.lastName,
      walletAddress: entry.walletAddress ? normalizeAddress(entry.walletAddress) : undefined,
      walletBinding: entry.walletBinding,
      status: entry.status || (entry.walletAddress ? 'accepted' : 'pending'),
    }));
    if (!resolveWallets) return normalized;
    for (const participant of normalized) {
      if (!participant.walletAddress && participant.email) {
        const resolved = await this.platformUsers.getOrCreateUserWithWallet(participant.email);
        participant.walletAddress = resolved.walletAddress || undefined;
        participant.walletBinding = participant.walletAddress ? 'verified_via_auth' : undefined;
        participant.status = participant.walletAddress ? 'invited' : 'pending';
      }
    }
    return normalized;
  }

  private normalizeAndValidateEmailList(values: unknown, fieldName: string) {
    const items = Array.isArray(values) ? values : [];
    const normalized = items.map((value) => this.normalizeAndValidateEmail(String(value || ''), fieldName)).filter(Boolean);
    return [...new Set(normalized)];
  }

  private normalizeAndValidateEmail(value: string, fieldName: string) {
    const email = normalizeEmail(value);
    if (!email) return '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException(`Invalid ${fieldName}`);
    }
    return email;
  }

  private touch(agreement: any) {
    agreement.updatedAt = new Date().toISOString();
  }

  private requireSupportedChainId(value: unknown) {
    try {
      return this.config.normalizeAgreementChainId(value);
    } catch {
      const supported = this.config.getSupportedAgreementChains().map((chain) => chain.chainId).join(', ');
      throw new BadRequestException(`Unsupported chainId. Supported chain IDs: ${supported}`);
    }
  }
}
