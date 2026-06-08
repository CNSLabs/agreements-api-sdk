import './sentry';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from "react-router";
import { WagmiProvider, createConfig } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "viem";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { DynamicWagmiConnector } from "@dynamic-labs/wagmi-connector";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { ThemeProvider } from '@/components/theme-provider';
import Router from '@/Router';
import ConnectionResolver from './components/ConnectionResolver';
import '@/index.css';
import { AuthInitProvider } from './components/AuthInitProvider';
import { initializeMarketingTelemetry } from './marketingTelemetry';
import { getDynamicEvmNetwork, loadRuntimeAgreementConfig } from '@/utils/chainConfig';


const envId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID;

const queryClient = new QueryClient();
initializeMarketingTelemetry();

const DynamicAuthWrapper = ({
  children,
  wagmiConfig,
  dynamicEvmNetworks,
}: {
  children: React.ReactNode;
  wagmiConfig: ReturnType<typeof createConfig>;
  dynamicEvmNetworks: ReturnType<typeof getDynamicEvmNetwork>[];
}) => (
    <DynamicContextProvider
      settings={{
        environmentId: envId,
        walletConnectors: [EthereumWalletConnectors],
        overrides: {
          evmNetworks: (dashboardNetworks) => [
            ...dynamicEvmNetworks,
            ...dashboardNetworks.filter((network) => !dynamicEvmNetworks.some((configured) => Number(network.chainId) === configured.chainId)),
          ],
        },
        events: {
          onAuthSuccess: () => {
            sessionStorage.setItem('freshAuth', 'true');
          },
        },
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <DynamicWagmiConnector evmNetworks={dynamicEvmNetworks}>
            <ConnectionResolver>
              <AuthInitProvider>{children}</AuthInitProvider>
            </ConnectionResolver>
          </DynamicWagmiConnector>
        </QueryClientProvider>
      </WagmiProvider>
    </DynamicContextProvider>
)

async function bootstrap() {
  const runtimeConfig = await loadRuntimeAgreementConfig();
  const chainConfigs = runtimeConfig.supportedChains;
  const wagmiConfig = createConfig({
    chains: chainConfigs.map((chainConfig) => chainConfig.chain) as [typeof chainConfigs[number]["chain"], ...typeof chainConfigs[number]["chain"][]],
    multiInjectedProviderDiscovery: false,
    transports: Object.fromEntries(
      chainConfigs.map((chainConfig) => [chainConfig.chainId, http(chainConfig.rpcUrl)]),
    ),
  });
  const dynamicEvmNetworks = chainConfigs.map(getDynamicEvmNetwork);

  createRoot(document.getElementById('root')!).render(
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <DynamicAuthWrapper wagmiConfig={wagmiConfig} dynamicEvmNetworks={dynamicEvmNetworks}>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Router />
        </BrowserRouter>
      </DynamicAuthWrapper>
    </ThemeProvider>
  );
}

bootstrap().catch((error) => {
  createRoot(document.getElementById('root')!).render(
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-white">
      <div className="max-w-lg rounded-lg border border-red-700 bg-red-950/40 p-6">
        <h1 className="mb-2 text-xl font-semibold">Failed to load agreement chain configuration</h1>
        <p className="text-sm text-red-100">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    </div>
  );
});
