import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizePermitSignature,
  signAgreementInputPermit,
  signDeployWithPermit,
} from '../dist/index.js';

const publicClient = {
  getChainId: async () => 59141,
};

const walletClient = {};

describe('viem signing helpers', () => {
  it('normalizes legacy ECDSA parts while preserving opaque smart-account bytes', () => {
    const opaque = '0x1234abcd';
    assert.equal(normalizePermitSignature(opaque), opaque);
    assert.equal(
      normalizePermitSignature({
        v: 27,
        r: `0x${'11'.repeat(32)}`,
        s: `0x${'22'.repeat(32)}`,
      }),
      `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`,
    );
    assert.throws(() => normalizePermitSignature({ v: 27, r: '0x1', s: '0x2' }));
  });

  it('reject deploy signing when requested chainId differs from the public client chain', async () => {
    await assert.rejects(
      () => signDeployWithPermit({
        walletClient,
        publicClient,
        chainId: 84532,
        agreement: {},
        deadline: 1,
      }),
      /Requested chainId 84532 does not match publicClient chainId 59141/,
    );
  });

  it('reject input signing when requested chainId differs from the public client chain', async () => {
    await assert.rejects(
      () => signAgreementInputPermit({
        walletClient,
        publicClient,
        chainId: 84532,
        agreementContractAddress: '0x1111111111111111111111111111111111111111',
        agreement: {},
        inputId: 'accept',
        values: {},
        deadline: 1,
      }),
      /Requested chainId 84532 does not match publicClient chainId 59141/,
    );
  });
});
