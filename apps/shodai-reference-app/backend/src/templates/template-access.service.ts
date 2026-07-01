import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TemplateAccessRepository } from '../database/repositories/template-access.repository';
import { UserContactRepository } from '../database/repositories/user-contact.repository';
import { PlatformUserRepository } from '../database/repositories/platform-user.repository';
import { TemplateCatalogService } from './template-catalog.service';

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

@Injectable()
export class TemplateAccessService {
  constructor(
    private readonly templateAccess: TemplateAccessRepository,
    private readonly contacts: UserContactRepository,
    private readonly users: PlatformUserRepository,
    private readonly catalog: TemplateCatalogService,
  ) {}

  async getDefaults() {
    const record = await this.templateAccess.findOne({ kind: 'global-default' });
    if (Array.isArray(record?.templateIds) && record.templateIds.length > 0) return record;
    return {
      kind: 'global-default',
      templateIds: await this.catalog.listVisibleTemplateIds(),
      source: 'catalog-default',
    };
  }

  async setDefaults(templateIds: string[]) {
    const doc = { kind: 'global-default', templateIds: await this.normalizeTemplateIds(templateIds) };
    await this.templateAccess.upsertOne({ kind: 'global-default' }, doc);
    return doc;
  }

  async list() {
    return { items: await this.templateAccess.find({ kind: 'user-whitelist' }) };
  }

  async get(platformUserId: string) {
    const record = await this.templateAccess.findOne({ kind: 'user-whitelist', platformUserId });
    if (!record) throw new NotFoundException('No template access record for this user');
    return record;
  }

  async set(platformUserId: string, templateIds: string[]) {
    const doc = { kind: 'user-whitelist', platformUserId, templateIds: await this.normalizeTemplateIds(templateIds) };
    await this.templateAccess.upsertOne({ kind: 'user-whitelist', platformUserId }, doc);
    return doc;
  }

  async delete(platformUserId: string) {
    const deleted = await this.templateAccess.deleteOne({ kind: 'user-whitelist', platformUserId });
    if (!deleted) throw new NotFoundException('No template access record for this user');
    return { ok: true };
  }

  async getByEmail(email: string) {
    return this.get(await this.resolvePlatformUserIdByEmail(email));
  }

  async setByEmail(email: string, templateIds: string[]) {
    return this.set(await this.resolveOrCreatePlatformUserIdByEmail(email), templateIds);
  }

  async deleteByEmail(email: string) {
    return this.delete(await this.resolvePlatformUserIdByEmail(email));
  }

  private async resolvePlatformUserIdByEmail(email: string): Promise<string> {
    const contact = await this.contacts.findOne({ type: 'email', valueNormalized: normalizeEmail(email) });
    if (!contact?.userId) throw new NotFoundException('No user found for this email');
    return contact.userId;
  }

  private async resolveOrCreatePlatformUserIdByEmail(email: string): Promise<string> {
    const existing = await this.contacts.findOne({ type: 'email', valueNormalized: normalizeEmail(email) });
    if (existing?.userId) return existing.userId;

    const now = new Date().toISOString();
    const userId = randomUUID();
    await this.users.insertOne({ id: userId, status: 'INVITED', createdAt: now, updatedAt: now });
    await this.contacts.insertOne({
      id: randomUUID(),
      userId,
      type: 'email',
      value: normalizeEmail(email),
      valueNormalized: normalizeEmail(email),
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  }

  private async normalizeTemplateIds(templateIds: string[]) {
    return this.catalog.getFrontendTemplateIds((Array.isArray(templateIds) ? templateIds : []).map((id) => String(id).trim()).filter(Boolean));
  }
}
