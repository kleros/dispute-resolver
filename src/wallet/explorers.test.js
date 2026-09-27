import networkMap from "../ethereum/network-contract-mapping";
import { EXAMPLES } from "./walletStatus";
import { EXPLORER_BASE_URLS, getContractCodeUrl, getExplorerBaseUrl } from "./explorers";

const MAINNET_PROXY = networkMap[1].ARBITRABLE_PROXY;

describe("explorer base URLs", () => {
  it("only lists chains of the network map, as https origins without a trailing slash", () => {
    Object.entries(EXPLORER_BASE_URLS).forEach(([chainId, url]) => {
      expect(networkMap[chainId]).toBeDefined();
      expect(url).toMatch(/^https:\/\/[a-z0-9.-]+$/);
    });
  });

  it("knows the explorers of the contract examples", () => {
    expect(getExplorerBaseUrl("1")).toBe("https://etherscan.io");
    expect(getExplorerBaseUrl("100")).toBe("https://gnosisscan.io");
    expect(getExplorerBaseUrl("11155111")).toBe("https://sepolia.etherscan.io");
    expect(getExplorerBaseUrl(1)).toBe("https://etherscan.io");
  });

  it("resolves null for unknown, retired and odd chain ids", () => {
    expect(getExplorerBaseUrl("999")).toBeNull();
    expect(getExplorerBaseUrl("5")).toBeNull();
    expect(getExplorerBaseUrl("80001")).toBeNull();
    expect(getExplorerBaseUrl(null)).toBeNull();
    expect(getExplorerBaseUrl(undefined)).toBeNull();
    expect(getExplorerBaseUrl("constructor")).toBeNull();
    expect(getExplorerBaseUrl({})).toBeNull();
  });
});

describe("getContractCodeUrl", () => {
  it("links to the verified code of a contract", () => {
    expect(getContractCodeUrl("1", MAINNET_PROXY)).toBe(EXAMPLES.NO_WALLET.chain.contractExplorerUrl);
  });

  it("is null without an explorer or without an address", () => {
    expect(getContractCodeUrl("999", MAINNET_PROXY)).toBeNull();
    expect(getContractCodeUrl("1", null)).toBeNull();
    expect(getContractCodeUrl("1", undefined)).toBeNull();
    expect(getContractCodeUrl("1", "")).toBeNull();
    expect(getContractCodeUrl("1", 42)).toBeNull();
  });
});
