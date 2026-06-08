import { Injectable, NotFoundException } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StandaloneConfigService } from '../config/standalone-config.service';

const APP_ROOT = path.resolve(__dirname, '../../..');
const AGREEMENT_TEMPLATES_DIR = process.env.AGREEMENT_TEMPLATES_DIR || path.join(APP_ROOT, 'data', 'agreement-templates');

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

@Injectable()
export class TemplateCatalogService {
  private cache: any[] | null = null;

  constructor(private readonly config: StandaloneConfigService) {}

  async listMetadata() {
    return (await this.listVisibleTemplates())
      .map((template) => template.metadata)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }

  async getTemplate(templateId: string) {
    const normalizedTemplateId = await this.getFrontendTemplateId(templateId);
    const template = (await this.listVisibleTemplates()).find((entry) => entry.metadata?.templateId === normalizedTemplateId);
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  async listVisibleTemplates() {
    const allowedRaw = process.env.AGREEMENT_TEMPLATE_ALLOWED_IDS || process.env.VITE_ALLOWED_TEMPLATE_IDS || '';
    const allowed = allowedRaw ? new Set(await this.getFrontendTemplateIds(allowedRaw.split(','))) : null;
    return (await this.readTemplates()).filter((template) => !allowed || allowed.has(template.metadata.templateId));
  }

  async getFrontendTemplateIds(templateIds: string[]) {
    const templates = await this.readTemplates();
    const byKnownId = new Map<string, string>();
    for (const template of templates) {
      const frontendId = String(template.metadata?.templateId || '').trim();
      if (!frontendId) continue;
      for (const candidate of [template.metadata?.templateId, template.metadata?.id]) {
        const key = String(candidate || '').trim();
        if (key) byKnownId.set(key, frontendId);
      }
    }
    return [...new Set((Array.isArray(templateIds) ? templateIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
      .map((id) => byKnownId.get(id) || id))];
  }

  async getFrontendTemplateId(templateId: string) {
    return (await this.getFrontendTemplateIds([templateId]))[0] || '';
  }

  private async readTemplates() {
    if (this.cache) return this.cache;
    const files = (await fs.readdir(AGREEMENT_TEMPLATES_DIR)).filter((file) => file.endsWith('.json')).sort();
    this.cache = await Promise.all(files.map(async (file) => {
      const template = JSON.parse(await fs.readFile(path.join(AGREEMENT_TEMPLATES_DIR, file), 'utf8'));
      return {
        ...template,
        metadata: {
          ...template.metadata,
          assets: this.buildAssetUrls(template.metadata.templateId),
        },
      };
    }));
    return this.cache;
  }

  private buildAssetUrls(templateId: string) {
    const assetBase = process.env.AGREEMENT_TEMPLATE_ASSET_BASE_URL || `${ensureTrailingSlash(this.config.frontendBaseUrl)}template-assets/`;
    const slug = String(templateId).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return { thumbnailUrl: `${ensureTrailingSlash(assetBase)}${slug}.png`, pdfUrl: `${ensureTrailingSlash(assetBase)}${slug}.pdf` };
  }
}
