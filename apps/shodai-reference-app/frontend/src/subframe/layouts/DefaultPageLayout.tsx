// @subframe/sync-disable
// This has complex javascript logic, should not be synced
"use client";
/*
 * Documentation:
 * Default Page Layout — https://app.subframe.com/345c49081508/library?component=Default+Page+Layout_a57b1c43-310a-493f-b807-8cc88e2452cf
 * Dropdown Menu — https://app.subframe.com/345c49081508/library?component=Dropdown+Menu_99951515-459b-4286-919e-a89e7549b43b
 * Topbar with tabs — https://app.subframe.com/345c49081508/library?component=Topbar+with+tabs_6da83a87-48a6-4316-a989-ea33ed7ff81e
 * UserAccountMenu — https://app.subframe.com/345c49081508/library?component=UserAccountMenu_5034a436-1c2d-4ad4-9993-54259f43fb50
 */

import React from "react";
import { useNavigate, useLocation } from "react-router";
import { useAccount as useWagmiAccount, usePublicClient, useSwitchChain } from "wagmi";
import { FeatherLogOut } from "@subframe/core";
import { FeatherSettings2 } from "@subframe/core";
import { FeatherUser } from "@subframe/core";
import { DropdownMenu } from "../components/DropdownMenu";
import { TopbarWithTabs } from "../components/TopbarWithTabs";
import { UserAccountMenu } from "../components/UserAccountMenu";
import { Button } from "../components/Button";
import makeBlockie from "ethereum-blockies-base64";
import { useLogin } from "@/hooks/useLogin";
import { getDefaultChainConfig, getSupportedChainConfigs, isSupportedAgreementChainId } from "@/utils/chainConfig";
import SentryDevErrorButton from "@/components/SentryDevErrorButton";
import * as SubframeUtils from "../utils";

interface DefaultPageLayoutRootProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
}

const DefaultPageLayoutRoot = React.forwardRef<
  HTMLDivElement,
  DefaultPageLayoutRootProps
>(function DefaultPageLayoutRoot(
  { children, className, ...otherProps }: DefaultPageLayoutRootProps,
  ref
) {
  const { address, disconnect } = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const publicClient = usePublicClient();
  const { chainId: accountChainId } = useWagmiAccount();
  const { switchChainAsync } = useSwitchChain();
  const [isDisconnecting, setIsDisconnecting] = React.useState(false);
  const [chainError, setChainError] = React.useState<string | null>(null);

  const ensureCorrectChain = React.useCallback(async () => {
    setChainError(null);
    if (!publicClient || !switchChainAsync) return;

    let chainConfig;
    try {
      const current = accountChainId ?? await publicClient.getChainId();
      if (isSupportedAgreementChainId(current)) return;
      chainConfig = getDefaultChainConfig();
    } catch (error) {
      setChainError(error instanceof Error ? error.message : "Chain configuration error");
      return;
    }

    try {
      await switchChainAsync({ chainId: chainConfig.chainId });
    } catch (error) {
      const supported = getSupportedChainConfigs().map((chain) => `${chain.chainName} (${chain.chainId})`).join(", ");
      const message = error instanceof Error && error.message ? ` ${error.message}` : "";
      setChainError(`Please switch your wallet network to a supported agreement chain: ${supported}.${message}`);
    }
  }, [accountChainId, publicClient, switchChainAsync]);

  React.useEffect(() => {
    if (!address) return;
    void ensureCorrectChain();
  }, [ensureCorrectChain, address]);

  const handleLogout = React.useCallback(async () => {
    setIsDisconnecting(true);
    try {
      await disconnect();
      navigate("/login");
    } catch (error) {
      console.error("Error disconnecting:", error);
    } finally {
      setIsDisconnecting(false);
    }
  }, [disconnect, navigate]);

  const path = location.pathname || "";
  const activeTab =
    path.startsWith("/agreements")
      ? "agreements"
      : path.startsWith("/create") || path.startsWith("/templates") || path.startsWith("/document")
        ? "templates"
        : "home";

  const navItems = [
    { id: "home" as const, label: "Home", href: "/home" },
    { id: "agreements" as const, label: "Agreements", href: "/agreements" },
    { id: "templates" as const, label: "Templates", href: "/create" },
  ];

  const formattedAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";

  return (
    <div
      className={SubframeUtils.twClassNames(
        "flex h-screen w-full flex-col items-center",
        className
      )}
      ref={ref}
      {...otherProps}
    >
      <TopbarWithTabs
        className="sticky top-0 z-50"
        rightSlot={
          <div className="flex items-center gap-2">
            <SentryDevErrorButton />
            {address ? (
              <UserAccountMenu
                walletAddress={formattedAddress}
                image={makeBlockie(address)}
                clipboardText={address}
                menuItems={
                  <>
                    <DropdownMenu.DropdownItem icon={<FeatherUser />}>
                      Profile
                    </DropdownMenu.DropdownItem>
                    <DropdownMenu.DropdownItem icon={<FeatherSettings2 />}>
                      Settings
                    </DropdownMenu.DropdownItem>
                    <DropdownMenu.DropdownItem
                      icon={<FeatherLogOut />}
                      onSelect={handleLogout}
                      disabled={isDisconnecting}
                    >
                      {isDisconnecting ? "Logging out..." : "Logout"}
                    </DropdownMenu.DropdownItem>
                  </>
                }
              />
            ) : null}
          </div>
        }
        leftSlot={
          <>
            <button
              onClick={() => navigate("/home")}
              className="flex items-center gap-2 outline-none"
              title="Go to Home"
            >
              <span className="text-heading-3 font-heading-3 text-default-font">
                Shodai Agreements
              </span>
            </button>
            <div className="mobile:hidden flex items-center gap-[10px] self-stretch">
              {navItems.map((item) => (
                <TopbarWithTabs.NavItem
                  key={item.id}
                  selected={activeTab === item.id}
                  onClick={() => navigate(item.href)}
                >
                  {item.label}
                </TopbarWithTabs.NavItem>
              ))}
              <a
                href="https://docs.shodai.network"
                className="flex self-stretch no-underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                <TopbarWithTabs.NavItem>Docs</TopbarWithTabs.NavItem>
              </a>
              <a
                href="https://developers.shodai.network"
                className="flex self-stretch no-underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                <TopbarWithTabs.NavItem>Dev Portal</TopbarWithTabs.NavItem>
              </a>
            </div>
          </>
        }
      />
      {chainError ? (
        <div className="w-full border-b border-error-200 bg-error-50 sticky top-[60px] z-40">
          <div className="flex w-full items-center justify-between gap-4 px-[10px] py-2">
            <div className="text-sm text-error-700">{chainError}</div>
            <Button size="small" variant="neutral-secondary" onClick={ensureCorrectChain}>
              Switch network
            </Button>
          </div>
        </div>
      ) : null}
      {children ? (
        <div className="shodai-scrollbar flex w-full grow shrink-0 basis-0 flex-col items-start gap-0 overflow-y-auto bg-default-background">
          {children}
        </div>
      ) : null}
    </div>
  );
});

export const DefaultPageLayout = DefaultPageLayoutRoot;
