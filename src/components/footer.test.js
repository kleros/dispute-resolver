import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import Footer from "./footer";
import { EXAMPLES } from "../wallet/walletStatus";

const UNSUPPORTED_NETWORK = "Unsupported Network";
const SOCIAL_LINKS = [
  "https://github.com/kleros/dispute-resolver",
  "https://slack.kleros.io",
  "https://reddit.com/r/Kleros/",
  "https://twitter.com/kleros_io",
  "https://forum.kleros.io",
  "https://t.me/kleros",
  "https://www.linkedin.com/company/kleros/",
];

let container;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
});

const renderFooter = (status) =>
  act(async () => {
    ReactDOM.render(<Footer status={status} />, container);
  });

const chain = () => container.querySelector(".chain");
const testnetTag = () => container.querySelector(".testnet");
const explorerLink = () => container.querySelector(".explorer");
const hrefs = (root) => Array.from(root.querySelectorAll("a")).map((link) => link.getAttribute("href"));

//The label the footer must show for a chain: its name, the unsupported notice, or nothing while it is unknown.
const expectedChainLabel = (chainStatus) => {
  if (!chainStatus) return "";
  if (!chainStatus.supported) return UNSUPPORTED_NETWORK;
  return chainStatus.testnet ? `${chainStatus.name}Testnet` : chainStatus.name;
};

describe("Footer per wallet status", () => {
  it.each(Object.keys(EXAMPLES))("renders %s from the status alone", async (key) => {
    const status = EXAMPLES[key];
    await renderFooter(status);

    expect(chain().textContent).toBe(expectedChainLabel(status.chain));
    expect(testnetTag() !== null).toBe(Boolean(status.chain?.testnet));
    expect(chain().textContent.includes(UNSUPPORTED_NETWORK)).toBe(status.chain?.supported === false);

    const explorerUrl = status.chain?.contractExplorerUrl ?? null;
    if (explorerUrl === null) {
      expect(explorerLink()).toBeNull();
    } else {
      expect(explorerLink().getAttribute("href")).toBe(explorerUrl);
      expect(explorerLink().target).toBe("_blank");
      expect(explorerLink().rel.split(" ")).toEqual(expect.arrayContaining(["noopener", "noreferrer"]));
    }

    expect(container.querySelector('a[href="https://kleros.io"]')).not.toBeNull();
    expect(container.querySelector(".help").getAttribute("href")).toBe("https://t.me/kleros");
    expect(hrefs(container.querySelector(".social"))).toEqual(explorerUrl === null ? SOCIAL_LINKS : [explorerUrl, ...SOCIAL_LINKS]);
  });

  it("flags a testnet next to its name", async () => {
    await renderFooter(EXAMPLES.CONNECTED_TESTNET);
    expect(chain().textContent).toContain(EXAMPLES.CONNECTED_TESTNET.chain.name);
    expect(testnetTag().textContent).toBe("Testnet");
  });

  it("shows the unsupported notice without an explorer link for a chain outside the network map", async () => {
    await renderFooter(EXAMPLES.CONNECTED_UNSUPPORTED);
    expect(chain().textContent).toBe(UNSUPPORTED_NETWORK);
    expect(testnetTag()).toBeNull();
    expect(explorerLink()).toBeNull();
  });

  it("shows a placeholder and no explorer link while the chain is unknown", async () => {
    await renderFooter(EXAMPLES.CONNECTING);
    expect(chain().textContent).toBe("");
    expect(chain().querySelector(".chainPlaceholder")).not.toBeNull();
    expect(explorerLink()).toBeNull();
  });

  it("links the explorer only when the status carries a URL", async () => {
    const gnosis = EXAMPLES.CONNECTED_GNOSIS;
    await renderFooter({ ...gnosis, chain: { ...gnosis.chain, contractExplorerUrl: null } });
    expect(chain().textContent).toBe(gnosis.chain.name);
    expect(explorerLink()).toBeNull();
  });
});

describe("Footer without a usable status", () => {
  it.each([undefined, null, {}, { chain: {} }])("renders the links with %p", async (status) => {
    await renderFooter(status);
    expect(chain().textContent).toBe("");
    expect(explorerLink()).toBeNull();
    expect(container.querySelector('a[href="https://kleros.io"]')).not.toBeNull();
    expect(hrefs(container.querySelector(".social"))).toEqual(SOCIAL_LINKS);
  });
});
