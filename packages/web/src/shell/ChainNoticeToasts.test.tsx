import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useChainNotice, type ChainNotice } from "../routing";
import { ChainNoticeToasts, chainNoticeToast } from "./ChainNoticeToasts";
import { ToastProvider } from "./ToastProvider";

const DECLINED_ON_LIST: ChainNotice = {
  outcome: "declined",
  walletChainId: 100,
  pageChainId: 1,
  disputeId: null,
  reason: "The switch to Ethereum Mainnet was declined in the wallet.",
};

function Emitter({ notice }: { readonly notice: ChainNotice }) {
  const emit = useChainNotice();
  return (
    <button
      type="button"
      onClick={() => {
        emit(notice);
      }}
    >
      Emit
    </button>
  );
}

function emit(notice: ChainNotice) {
  render(
    <ToastProvider>
      <ChainNoticeToasts>
        <Emitter notice={notice} />
      </ChainNoticeToasts>
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Emit" }));
}

function region() {
  return within(screen.getByRole("region", { name: "Notifications" }));
}

describe("ChainNoticeToasts", () => {
  it("a declined switch on a list page shows one neutral toast naming the chain the app now shows", () => {
    emit(DECLINED_ON_LIST);
    const [toast, ...others] = region().getAllByRole("status");
    expect(others).toEqual([]);
    expect(toast).toHaveTextContent("Wallet stayed on Gnosis Network");
    expect(toast).toHaveTextContent("The app is now showing Gnosis Network.");
    expect(region().queryByRole("alert")).toBeNull();
  });

  it("a declined switch on a case page says the dispute is on the other chain and that the wallet chain's Ongoing Disputes are shown", () => {
    emit({ ...DECLINED_ON_LIST, disputeId: 1621n });
    const toast = region().getByRole("status");
    expect(toast).toHaveTextContent("Wallet stayed on Gnosis Network");
    expect(toast).toHaveTextContent("Dispute 1621 is on Ethereum Mainnet, so the app is showing Ongoing Disputes on Gnosis Network.");
  });

  it("a failed switch shows an error toast with the wallet's reason", () => {
    emit({ ...DECLINED_ON_LIST, outcome: "failed", reason: "Could not switch to Ethereum Mainnet: Unrecognized chain ID" });
    const toast = region().getByRole("alert");
    expect(toast).toHaveTextContent("Network not switched");
    expect(toast).toHaveTextContent("Could not switch to Ethereum Mainnet: Unrecognized chain ID. The app is now showing Gnosis Network.");
    expect(region().queryByRole("status")).toBeNull();
  });

  it("a failed switch on a case page gives the reason, then where the dispute is and what the app shows", () => {
    emit({ ...DECLINED_ON_LIST, outcome: "failed", disputeId: 7n, reason: "Could not switch to Ethereum Mainnet: Request already pending." });
    expect(region().getByRole("alert")).toHaveTextContent(
      "Could not switch to Ethereum Mainnet: Request already pending. Dispute 7 is on Ethereum Mainnet, so the app is showing Ongoing Disputes on Gnosis Network.",
    );
  });

  it("a failed switch away from an unconfigured wallet chain shows only the reason", () => {
    emit({ ...DECLINED_ON_LIST, outcome: "failed", walletChainId: 10, disputeId: 1621n, reason: "Could not switch to Ethereum Mainnet: Unrecognized chain ID" });
    const toast = region().getByRole("alert");
    expect(toast).toHaveTextContent("Network not switched");
    expect(toast).toHaveTextContent(/Could not switch to Ethereum Mainnet: Unrecognized chain ID\.$/);
    expect(toast).not.toHaveTextContent(/showing|Dispute/);
  });

  it("a declined switch notice stays up for 10 seconds, a failed one for 15, longer than the default toast", () => {
    expect(chainNoticeToast(DECLINED_ON_LIST)?.autoHideMs).toBe(10_000);
    expect(chainNoticeToast({ ...DECLINED_ON_LIST, disputeId: 1621n })?.autoHideMs).toBe(10_000);
    expect(chainNoticeToast({ ...DECLINED_ON_LIST, outcome: "failed" })?.autoHideMs).toBe(15_000);
    expect(chainNoticeToast({ ...DECLINED_ON_LIST, outcome: "failed", walletChainId: 10 })?.autoHideMs).toBe(15_000);
  });

  it("a declined switch away from an unconfigured wallet chain shows no toast, since the unsupported-network screen explains it", () => {
    emit({ ...DECLINED_ON_LIST, walletChainId: 10 });
    expect(region().queryByRole("status")).toBeNull();
    expect(region().queryByRole("alert")).toBeNull();
  });
});
