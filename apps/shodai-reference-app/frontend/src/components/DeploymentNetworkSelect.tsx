import * as React from "react";
import * as SubframeCore from "@subframe/core";
import { FeatherCheck, FeatherChevronRight } from "@subframe/core";
import type { ChainConfig } from "@/utils/chainConfig";

interface DeploymentNetworkSelectProps {
  chains: ChainConfig[];
  selectedChainId: number;
  onSelect: (chainId: number) => void;
  className?: string;
}

export function DeploymentNetworkSelect({
  chains,
  selectedChainId,
  onSelect,
  className = "",
}: DeploymentNetworkSelectProps) {
  const selectedChain = chains.find((chain) => chain.chainId === selectedChainId) ?? chains[0];

  return (
    <div className={`flex w-[280px] flex-none flex-col items-start gap-1 mobile:w-full ${className}`}>
      <span className="text-caption font-caption text-subtext-color">Deployment Network</span>
      <SubframeCore.DropdownMenu.Root>
        <SubframeCore.DropdownMenu.Trigger asChild={true}>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between gap-3 rounded-md border border-solid border-neutral-border bg-default-background px-3 text-left text-body font-body text-default-font hover:bg-neutral-50 focus:outline-none focus:ring-1 focus:ring-brand-primary"
          >
            <span className="min-w-0 truncate">{selectedChain?.chainName || "Select chain"}</span>
            <FeatherChevronRight className="h-4 w-4 flex-none rotate-90 text-subtext-color" />
          </button>
        </SubframeCore.DropdownMenu.Trigger>
        <SubframeCore.DropdownMenu.Portal>
          <SubframeCore.DropdownMenu.Content
            side="bottom"
            align="start"
            sideOffset={6}
            className="z-[100] w-[min(280px,calc(100vw-32px))] border border-solid border-neutral-border bg-default-background py-2 shadow-lg"
          >
            {chains.map((chain) => (
              <SubframeCore.DropdownMenu.Item
                key={chain.chainId}
                onSelect={() => onSelect(chain.chainId)}
                className="flex h-9 cursor-pointer items-center justify-between gap-3 px-3 text-body font-body text-default-font outline-none hover:bg-neutral-100 data-[highlighted]:bg-neutral-100"
              >
                <span className="min-w-0 truncate">{chain.chainName}</span>
                {chain.chainId === selectedChainId ? (
                  <FeatherCheck className="h-4 w-4 flex-none text-default-font" />
                ) : null}
              </SubframeCore.DropdownMenu.Item>
            ))}
          </SubframeCore.DropdownMenu.Content>
        </SubframeCore.DropdownMenu.Portal>
      </SubframeCore.DropdownMenu.Root>
    </div>
  );
}
