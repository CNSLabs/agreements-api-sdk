import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PlatformUserRepository } from '../database/repositories/platform-user.repository';
import { UserContactRepository } from '../database/repositories/user-contact.repository';
import { UserIdentityRepository } from '../database/repositories/user-identity.repository';
import { UserWalletRepository } from '../database/repositories/user-wallet.repository';
import { StandaloneConfigService } from '../config/standalone-config.service';
import { DynamicUser } from './auth.types';

function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

function normalizeAddress(value: string | undefined): string {
  const raw = String(value || '').trim();
  return /^0x[0-9a-fA-F]{40}$/.test(raw) ? raw.toLowerCase() : '';
}

function didFromDynamic(user: DynamicUser): string {
  const wallet = (user.wallets || []).find((entry) => normalizeAddress(entry.address));
  return wallet ? `did:pkh:eip155:1:${normalizeAddress(wallet.address)}` : `did:dynamic:${user.userId}`;
}

@Injectable()
export class PlatformUserService {
  constructor(
    private readonly users: PlatformUserRepository,
    private readonly identities: UserIdentityRepository,
    private readonly contacts: UserContactRepository,
    private readonly wallets: UserWalletRepository,
    private readonly config: StandaloneConfigService,
  ) {}

  async getOrCreateFromDynamic(dynamicUser: DynamicUser, recordSignIn = false) {
    const did = didFromDynamic(dynamicUser);
    const subject = `dynamic:${dynamicUser.userId}`;
    const email = normalizeEmail(dynamicUser.email || '');
    const now = new Date().toISOString();

    let identity = await this.identities.findOne({ provider: 'dynamic', subject });
    let user = identity ? await this.users.findOne({ id: identity.userId }) : null;

    if (!user && email) {
      const contact = await this.contacts.findOne({ type: 'email', valueNormalized: email });
      user = contact ? await this.users.findOne({ id: contact.userId }) : null;
      if (user?.status === 'DISABLED') throw new UnauthorizedException('Account is disabled');
      if (user?.status === 'INVITED') {
        user = { ...user, status: 'ACTIVE', updatedAt: now };
        await this.users.upsertOne({ id: user.id }, user);
      }
    }

    if (!user) {
      user = { id: randomUUID(), status: 'ACTIVE', createdAt: now, updatedAt: now };
      await this.users.insertOne(user);
    }

    if (recordSignIn) {
      user = {
        ...user,
        firstSignedInAt: user.firstSignedInAt || now,
        lastSignedInAt: now,
        signInCount: Number(user.signInCount || 0) + 1,
        updatedAt: now,
      };
      await this.users.upsertOne({ id: user.id }, user);
    } else {
      await this.users.updateOne({ id: user.id }, { $set: { updatedAt: now } });
    }

    if (!identity) {
      identity = { id: randomUUID(), userId: user.id, provider: 'dynamic', subject, data: dynamicUser, createdAt: now, lastSeenAt: now };
      await this.identities.insertOne(identity);
    } else {
      await this.identities.updateOne({ id: identity.id }, { $set: { data: dynamicUser, lastSeenAt: now } });
    }

    if (email && !(await this.contacts.findOne({ type: 'email', valueNormalized: email }))) {
      await this.contacts.insertOne({
        id: randomUUID(),
        userId: user.id,
        type: 'email',
        value: email,
        valueNormalized: email,
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const wallet of dynamicUser.wallets || []) {
      const address = normalizeAddress(wallet.address);
      if (!address || await this.wallets.findOne({ address })) continue;
      await this.wallets.insertOne({ id: randomUUID(), userId: user.id, chainId: 1, address, did: `did:pkh:eip155:1:${address}`, source: 'dynamic', createdAt: now });
    }

    return { platformUserId: user.id, did };
  }

  async resolveByDid(did: string) {
    const wallet = await this.wallets.findOne({ did });
    if (!wallet) throw new NotFoundException('User not found');
    return { id: did, email: await this.primaryEmail(wallet.userId), platformUserId: wallet.userId };
  }

  async resolveByPlatformUserId(userId: string) {
    const user = await this.users.findOne({ id: userId });
    if (!user) throw new NotFoundException('User not found');
    return { id: user.id, email: await this.primaryEmail(user.id) };
  }

  async resolveByEmail(emailRaw: string) {
    const contact = await this.contacts.findOne({ type: 'email', valueNormalized: normalizeEmail(emailRaw) });
    if (!contact) throw new NotFoundException('User not found');
    return { id: contact.userId, email: contact.valueNormalized || contact.value };
  }

  async getOrCreateUserWithWallet(emailRaw: string) {
    const email = normalizeEmail(emailRaw);
    if (!email) throw new BadRequestException('Missing email');
    const now = new Date().toISOString();
    let contact = await this.contacts.findOne({ type: 'email', valueNormalized: email });
    let user = contact ? await this.users.findOne({ id: contact.userId }) : null;

    if (!user) {
      user = { id: randomUUID(), status: 'INVITED', createdAt: now, updatedAt: now };
      await this.users.insertOne(user);
      contact = {
        id: randomUUID(),
        userId: user.id,
        type: 'email',
        value: email,
        valueNormalized: email,
        createdAt: now,
        updatedAt: now,
      };
      await this.contacts.insertOne(contact);
    }

    const wallet = await this.wallets.findOne({ userId: user.id });
    if (wallet?.address) return { userId: user.id, walletAddress: wallet.address };

    const walletAddress = await this.pregenerateWallet(email, user.id);
    return { userId: user.id, walletAddress };
  }

  private async primaryEmail(userId: string) {
    const contacts = await this.contacts.find({ userId, type: 'email' }, { sort: { updatedAt: -1 } } as any);
    return contacts[0]?.valueNormalized || contacts[0]?.value;
  }

  private async pregenerateWallet(email: string, userId: string): Promise<string | null> {
    if (!this.config.dynamicEnvironmentId || !this.config.dynamicApiToken) {
      if (this.config.nodeEnv === 'test') return null;
      throw new InternalServerErrorException('Wallet pregeneration failed: missing Dynamic WaaS config');
    }

    const response = await fetch(`https://app.dynamic.xyz/api/v0/environments/${this.config.dynamicEnvironmentId}/waas/create`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.config.dynamicApiToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: email, type: 'email', chains: ['EVM'] }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const credential = (data?.user?.verifiedCredentials || data?.verifiedCredentials || [])
      .find((entry: any) => entry?.format === 'blockchain' && entry?.address);
    const address = normalizeAddress(credential?.address);
    if (!address) return null;
    await this.wallets.insertOne({ id: randomUUID(), userId, chainId: 1, address, did: `did:pkh:eip155:1:${address}`, source: 'dynamic', createdAt: new Date().toISOString() });
    return address;
  }
}
