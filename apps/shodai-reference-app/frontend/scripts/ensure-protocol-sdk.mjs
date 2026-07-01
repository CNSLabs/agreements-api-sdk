import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

try {
  require.resolve('@cns-labs/agreements-protocol-evm');
  process.exit(0);
} catch {
  console.error('@cns-labs/agreements-protocol-evm is not installed. Run `pnpm install` from the agreements-api-sdk root.');
  process.exit(1);
}
