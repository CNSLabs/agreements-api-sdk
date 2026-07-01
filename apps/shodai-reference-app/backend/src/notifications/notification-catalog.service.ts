import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { NotificationTemplate } from '@cns-labs/agreements-api-client';

const APP_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_NOTIFICATION_TEMPLATES_DIR = path.join(APP_ROOT, 'data', 'notification-templates');
const MONOREPO_NOTIFICATION_TEMPLATES_DIR = path.resolve(APP_ROOT, '../../../agreements-template-catalog/notification-templates');

type NotificationTemplateRecord = NotificationTemplate & {
  metadata?: NonNullable<NotificationTemplate['metadata']> & {
    agreementTemplateId?: string;
  };
};

@Injectable()
export class NotificationCatalogService {
  private cache: NotificationTemplateRecord[] | null = null;

  async getTemplateByAgreementTemplateId(agreementTemplateId: string): Promise<NotificationTemplateRecord | null> {
    const normalizedTemplateId = String(agreementTemplateId || '').trim();
    if (!normalizedTemplateId) return null;
    return (await this.readTemplates()).find((template) => template.metadata?.agreementTemplateId === normalizedTemplateId) || null;
  }

  async requireTemplateByAgreementTemplateId(agreementTemplateId: string): Promise<NotificationTemplateRecord> {
    const template = await this.getTemplateByAgreementTemplateId(agreementTemplateId);
    if (!template) throw new NotFoundException('Notification template not found');
    return template;
  }

  async getExternalWebhookTemplateByAgreementTemplateId(agreementTemplateId: string): Promise<NotificationTemplateRecord | null> {
    const template = await this.getTemplateByAgreementTemplateId(agreementTemplateId);
    return template ? this.withExternalWebhookChannel(template) : null;
  }

  withExternalWebhookChannel(template: NotificationTemplateRecord): NotificationTemplateRecord {
    return {
      ...template,
      metadata: template.metadata ? { ...template.metadata } : undefined,
      rules: (template.rules || []).map((rule) => ({
        ...rule,
        notification: {
          ...rule.notification,
          channel: 'external_webhook',
        },
      })),
    };
  }

  private async readTemplates(): Promise<NotificationTemplateRecord[]> {
    if (this.cache) return this.cache;
    const dirs = await this.resolveTemplatesDirs();
    if (dirs.length === 0) {
      this.cache = [];
      return this.cache;
    }
    const templates: NotificationTemplateRecord[] = [];
    const seenAgreementTemplateIds = new Set<string>();
    for (const dir of dirs) {
      const files = (await fs.readdir(dir))
        .filter((file) => file.endsWith('.notifications.json'))
        .sort();
      for (const file of files) {
        const raw = await fs.readFile(path.join(dir, file), 'utf8');
        const template = JSON.parse(raw) as NotificationTemplateRecord;
        const agreementTemplateId = String(template.metadata?.agreementTemplateId || '').trim();
        if (agreementTemplateId && seenAgreementTemplateIds.has(agreementTemplateId)) continue;
        if (agreementTemplateId) seenAgreementTemplateIds.add(agreementTemplateId);
        templates.push(template);
      }
    }
    this.cache = templates;
    return this.cache;
  }

  private async resolveTemplatesDirs(): Promise<string[]> {
    const explicit = process.env.NOTIFICATION_TEMPLATES_DIR;
    if (explicit) return [explicit];
    const dirs: string[] = [];
    if (await directoryExists(DEFAULT_NOTIFICATION_TEMPLATES_DIR)) dirs.push(DEFAULT_NOTIFICATION_TEMPLATES_DIR);
    if (await directoryExists(MONOREPO_NOTIFICATION_TEMPLATES_DIR)) dirs.push(MONOREPO_NOTIFICATION_TEMPLATES_DIR);
    return dirs;
  }
}

async function directoryExists(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
