import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import UnsupportedNetwork from "./unsupportedNetwork";

let container;
let originalEthereum;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  originalEthereum = window.ethereum;
  window.ethereum = { request: jest.fn(), on: jest.fn(), removeAllListeners: jest.fn() };
});

afterEach(() => {
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  if (originalEthereum === undefined) delete window.ethereum;
  else window.ethereum = originalEthereum;
});

const render = async (props) => {
  await act(async () => {
    ReactDOM.render(<UnsupportedNetwork {...props} />, container);
  });
};

describe("UnsupportedNetwork", () => {
  it("names the chain and points to the switcher in the header, with no action of its own", async () => {
    await render({ network: "999" });
    const main = container.querySelector("main");
    expect(main.querySelector("h1").textContent).toBe("Unsupported network");
    expect(main.textContent).toContain("Chain 999 is not supported.");
    expect(main.textContent).toContain("switcher in the header");
    expect(main.querySelectorAll("a, button, [role='button']")).toHaveLength(0);
    expect(main.querySelector('[role="status"]')).not.toBeNull();
  });

  it("never touches the wallet", async () => {
    await render({ network: "999" });
    expect(window.ethereum.request).not.toHaveBeenCalled();
    expect(window.ethereum.on).not.toHaveBeenCalled();
  });

  it("copes without a chain id", async () => {
    await render({});
    expect(container.querySelector("main").textContent).toContain("This chain is not supported.");
  });
});
