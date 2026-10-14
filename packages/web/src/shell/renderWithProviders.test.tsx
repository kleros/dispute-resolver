import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useAtlasUpload } from "../atlas";
import { useCoreDeps } from "../data";
import { usePageChain } from "../routing";
import { fakeUploader } from "../test/atlas";
import { createTestDeps } from "../test/data";
import { renderWithProviders } from "../test/shell";
import { useWallet } from "../wallet";
import { useToast } from "./ToastProvider";

function Probe() {
  const page = usePageChain();
  const deps = useCoreDeps();
  const uploader = useAtlasUpload();
  const wallet = useWallet();
  const toaster = useToast();
  return (
    <div>
      <p>Chain {page.chain.name}</p>
      <p>Env {Object.keys(deps.env).join(",") || "empty"}</p>
      <p>Uploads {uploader.availability}</p>
      <p>Wallet {wallet.status}</p>
      <button
        type="button"
        onClick={() => {
          toaster.show({ variant: "success", title: "Toast shown" });
        }}
      >
        Toast
      </button>
    </div>
  );
}

describe("renderWithProviders (ARCHITECTURE.md §1.5)", () => {
  it("§1.5: renders a screen under the chain layout with every provider and the test frame", () => {
    const view = renderWithProviders(<Probe />, { path: "/100/ongoing" });
    expect(screen.getByText("Chain Gnosis Network")).toBeInTheDocument();
    expect(screen.getByText("Uploads ready")).toBeInTheDocument();
    expect(screen.getByText("Wallet disconnected")).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
  });

  it("§1.5: passes the given deps, uploader and wallet", async () => {
    const deps = createTestDeps({ env: { REACT_APP_TEST: "1" } });
    const view = renderWithProviders(<Probe />, { deps, uploader: fakeUploader({ availability: "unconfigured" }) });
    expect(screen.getByText("Env REACT_APP_TEST")).toBeInTheDocument();
    expect(screen.getByText("Uploads unconfigured")).toBeInTheDocument();
    await act(() => view.wallet.connect());
    expect(screen.getByText("Wallet connected")).toBeInTheDocument();
  });

  it("§1.5: toasts work below it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Probe />);
    await user.click(screen.getByRole("button", { name: "Toast" }));
    expect(screen.getByRole("status")).toHaveTextContent("Toast shown");
  });

  it("§1.5: frame page renders the app's header and footer around the screen", () => {
    renderWithProviders(<Probe />, { frame: "page" });
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByText("Chain Ethereum Mainnet")).toBeInTheDocument();
  });
});
