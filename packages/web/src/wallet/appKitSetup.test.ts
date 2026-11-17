import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAppConfig } from "../env";
import { createAppKitSetup } from "./appKitSetup";

const appKit = vi.hoisted(() => {
  let themeMode: "dark" | "light" = "light";
  return {
    getThemeMode: () => themeMode,
    setThemeMode: vi.fn((mode: "dark" | "light") => {
      themeMode = mode;
    }),
    reset(mode: "dark" | "light") {
      themeMode = mode;
    },
  };
});

vi.mock("@reown/appkit", () => ({
  createAppKit: (options: { readonly themeMode: "dark" | "light" }) => {
    appKit.reset(options.themeMode);
    return {
      getThemeMode: appKit.getThemeMode,
      setThemeMode: appKit.setThemeMode,
      ready: () => Promise.resolve(),
      getConnectors: () => [],
    };
  },
}));

vi.mock("@reown/appkit-adapter-wagmi", () => ({
  WagmiAdapter: class {
    readonly wagmiConfig = {};
  },
}));

afterEach(() => {
  document.documentElement.classList.remove("dark");
  appKit.setThemeMode.mockClear();
});

describe("createAppKitSetup", () => {
  it("AppKit's theme follows every change of the root class, not only the first render", async () => {
    createAppKitSetup(buildAppConfig({ REACT_APP_WALLETCONNECT_PROJECT_ID: "theme-test" }, { host: "localhost", origin: "http://localhost" }), "theme-test");
    document.documentElement.classList.add("dark");
    await vi.waitFor(() => {
      expect(appKit.setThemeMode).toHaveBeenLastCalledWith("dark");
    });
    document.documentElement.classList.remove("dark");
    await vi.waitFor(() => {
      expect(appKit.setThemeMode).toHaveBeenLastCalledWith("light");
    });
    expect(appKit.setThemeMode.mock.calls).toEqual([["dark"], ["light"]]);
  });
});
