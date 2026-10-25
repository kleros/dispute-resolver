import { act, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useAtlasUpload } from "../atlas";
import { useCoreDeps } from "../data";
import { usePageChain } from "../routing";
import { fakeUploader } from "../test/atlas";
import { createTestDeps } from "../test/data";
import { renderWithProviders } from "../test/shell";
import { useWallet } from "../wallet";
import { useColorScheme } from "./colorScheme";

function ColorSchemeProbe() {
  const { scheme } = useColorScheme();
  return <p>Scheme {scheme}</p>;
}

function Probe() {
  const page = usePageChain();
  const deps = useCoreDeps();
  const uploader = useAtlasUpload();
  const wallet = useWallet();
  return (
    <div>
      <p>Chain {page.chain.name}</p>
      <p>Env {Object.keys(deps.env).join(",") || "empty"}</p>
      <p>Uploads {uploader.availability}</p>
      <p>Wallet {wallet.status}</p>
    </div>
  );
}

describe("renderWithProviders", () => {
  it("renders a screen under the chain layout with every provider and the test frame", () => {
    const view = renderWithProviders(<Probe />, { path: "/100/ongoing" });
    expect(screen.getByText("Chain Gnosis Network")).toBeInTheDocument();
    expect(screen.getByText("Uploads ready")).toBeInTheDocument();
    expect(screen.getByText("Wallet disconnected")).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(view.currentPath()).toBe("/100/ongoing");
  });

  it("passes the given deps, uploader and wallet", async () => {
    const deps = createTestDeps({ env: { REACT_APP_TEST: "1" } });
    const view = renderWithProviders(<Probe />, { deps, uploader: fakeUploader({ availability: "unconfigured" }) });
    expect(screen.getByText("Env REACT_APP_TEST")).toBeInTheDocument();
    expect(screen.getByText("Uploads unconfigured")).toBeInTheDocument();
    await act(() => view.wallet.connect());
    expect(screen.getByText("Wallet connected")).toBeInTheDocument();
  });

  it("every screen renders under a colour-scheme provider", () => {
    const testFrame = renderWithProviders(<ColorSchemeProbe />);
    expect(screen.getByText("Scheme light")).toBeInTheDocument();
    testFrame.unmount();
    renderWithProviders(<ColorSchemeProbe />, { frame: "page" });
    expect(screen.getByText("Scheme light")).toBeInTheDocument();
  });
});
