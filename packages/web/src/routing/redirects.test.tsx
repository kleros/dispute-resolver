import { screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { useParams } from "react-router";
import { describe, expect, it } from "vitest";
import { TestDataProvider } from "../test/data";
import { TestFrame, renderInRouter } from "../test/routing";
import { createTestWallet } from "../test/wallet";
import { WalletSetupProvider } from "../wallet";
import { createAppRoutes } from "./createAppRoutes";
import { usePageChain } from "./pageChain";

function OngoingStub() {
  return <p>Ongoing page on {usePageChain().chainId}</p>;
}

function CaseStub() {
  const { id } = useParams();
  return (
    <p>
      Case page on {usePageChain().chainId} for {id ?? "no ID"}
    </p>
  );
}

const AppRoutes = createAppRoutes({ PageFrame: TestFrame, OngoingPage: OngoingStub, CreatePage: OngoingStub, CasePage: CaseStub });

/** Renders the app at `path` while AppKit is still loading (its chunk never arrives in these tests). */
function renderWhileAppKitLoads(path: string, pendingReconnect: boolean) {
  const wallet = createTestWallet();
  function Wrapper({ children }: { readonly children?: ReactNode }) {
    return (
      <TestDataProvider>
        <WalletSetupProvider setup={wallet.setup} pending pendingReconnect={pendingReconnect}>
          {children}
        </WalletSetupProvider>
      </TestDataProvider>
    );
  }
  return renderInRouter(createElement(AppRoutes), path, { wrapper: Wrapper });
}

describe("chain-less redirects while AppKit loads", () => {
  it("/ goes to the default chain's Ongoing page before AppKit loads when no connection is stored", async () => {
    const view = renderWhileAppKitLoads("/", false);
    expect(await screen.findByText("Ongoing page on 1")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/1/ongoing");
  });

  it("a chain-less case path goes to the default chain before AppKit loads when no connection is stored", async () => {
    const view = renderWhileAppKitLoads("/cases/5?tab=evidence", false);
    expect(await screen.findByText("Case page on 1 for 5")).toBeInTheDocument();
    expect(view.currentPath()).toBe("/1/cases/5?tab=evidence");
  });

  it("/ waits for AppKit when a connection is stored, so a returning wallet lands on its own chain", () => {
    const view = renderWhileAppKitLoads("/", true);
    expect(view.currentPath()).toBe("/");
    expect(screen.queryByText(/Ongoing page/)).not.toBeInTheDocument();
  });
});
