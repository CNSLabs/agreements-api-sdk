import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  signAgreementInputPermit,
  signDeployWithPermit,
} from '../dist/index.js';

const publicClient = {
  getChainId: async () => 59141,
};

const walletClient = {};

describe('viem signing helpers', () => {
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
