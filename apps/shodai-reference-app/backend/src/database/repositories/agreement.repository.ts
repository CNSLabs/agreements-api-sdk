import { Injectable } from '@nestjs/common';
import { Filter } from 'mongodb';
import { normalizeAddress } from '../../agreements/agreement-utils';
import { MongoCollectionsService } from '../mongo-collections.service';
import { StandaloneRepository } from '../standalone.repository';

export type AgreementIdentifierLookupResult = {
  agreement: Record<string, any> | null;
  matchedBy: 'id' | 'caip10' | 'address-chain' | 'address-unscoped' | 'none';
  ambiguous: boolean;
};

@Injectable()
export class AgreementRepository extends StandaloneRepository<Record<string, any>> {
  constructor(mongo: MongoCollectionsService) {
    super(mongo, 'agreements');
  }

  async findByIdentifier(
    identifier: string,
    options: { chainId?: number } = {},
  ): Promise<AgreementIdentifierLookupResult> {
    const id = String(identifier || '').trim();
    if (!id) return { agreement: null, matchedBy: 'none', ambiguous: false };

    const localAgreement = await this.findOne({ id });
    if (localAgreement) return { agreement: localAgreement, matchedBy: 'id', ambiguous: false };

    const caip10 = parseEip155AccountId(id);
    if (caip10) {
      return {
        agreement: await this.findOne({ chainId: caip10.chainId, address: caip10.address }),
        matchedBy: 'caip10',
        ambiguous: false,
      };
    }

    const address = normalizeAddress(id);
    if (!address) return { agreement: null, matchedBy: 'none', ambiguous: false };

    if (options.chainId) {
      return {
        agreement: await this.findOne({ chainId: options.chainId, address }),
        matchedBy: 'address-chain',
        ambiguous: false,
      };
    }

    const matches = await this.find({ address } as Filter<Record<string, any>>, { limit: 2 });
    return {
      agreement: matches.length === 1 ? matches[0] : null,
      matchedBy: 'address-unscoped',
      ambiguous: matches.length > 1,
    };
  }

  async updateWebhookMirrorIfFresh(id: string, eventCreatedAt: string, document: Record<string, any>): Promise<boolean> {
    const { _id, ...setDocument } = document;
    const result = await (await this.mongo.collection<Record<string, any>>('agreements')).updateOne(
      {
        id,
        $or: [
          { lastWebhookEventAt: { $exists: false } },
          { lastWebhookEventAt: null },
          { lastWebhookEventAt: { $lte: eventCreatedAt } },
        ],
      },
      { $set: setDocument },
    );
    return result.matchedCount > 0;
  }
}

function parseEip155AccountId(value: string): { chainId: number; address: string } | null {
  const match = value.match(/^eip155:(\d+):(0x[0-9a-fA-F]{40})$/);
  if (!match) return null;
  const chainId = Number(match[1]);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) return null;
  return { chainId, address: normalizeAddress(match[2]) };
}
