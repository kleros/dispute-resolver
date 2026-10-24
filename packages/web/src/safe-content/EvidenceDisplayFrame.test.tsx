import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvidenceDisplayFrame } from "./EvidenceDisplayFrame";
import type { EvidenceDisplayModel } from "./types";

const MODEL: EvidenceDisplayModel = {
  src: "https://cdn.kleros.link/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html?x",
  srcOrigin: "https://cdn.kleros.link",
  params: {
    disputeID: "1",
    chainID: 1,
    arbitratorContractAddress: "0x988b3a538b618c7a603e1c11ab82cd16dbe28069",
    arbitratorJsonRpcUrl: null,
    arbitratorChainID: 1,
    arbitrableContractAddress: "0x00000000000000000000000000000000000000aa",
    arbitrableChainID: 1,
    arbitrableJsonRpcUrl: null,
    jsonRpcUrl: null,
  },
  sandbox: ["allow-scripts", "allow-same-origin", "allow-popups", "allow-popups-to-escape-sandbox"],
  encoding: "json",
};

describe("EvidenceDisplayFrame", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the computed source and sandbox", () => {
    render(<EvidenceDisplayFrame model={MODEL} />);
    const frame = screen.getByTitle("Evidence display");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", MODEL.src);
    expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
  });

  it("sets the sandbox before the source, so the frame never loads unsandboxed", () => {
    render(<EvidenceDisplayFrame model={{ ...MODEL, sandbox: ["allow-scripts"] }} />);
    const names = screen.getByTitle("Evidence display").getAttributeNames();
    expect(names.filter((name) => name === "sandbox" || name === "src")).toEqual(["sandbox", "src"]);
  });

  it("has an accessible title and no allow or referrerpolicy attribute", () => {
    render(<EvidenceDisplayFrame model={MODEL} />);
    const frame = screen.getByTitle("Evidence display");
    expect(frame).not.toHaveAttribute("allow");
    expect(frame).not.toHaveAttribute("referrerpolicy");
  });

  it("sends no postMessage to the frame, on mount, on load or on a re-render", () => {
    const posted = vi.fn();
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
    if (descriptor?.get === undefined) throw new Error("jsdom exposes no contentWindow getter");
    vi.spyOn(HTMLIFrameElement.prototype, "contentWindow", "get").mockImplementation(function (this: HTMLIFrameElement) {
      const frameWindow = descriptor.get?.call(this) as Window | null;
      if (frameWindow !== null) frameWindow.postMessage = posted;
      return frameWindow;
    });
    const { rerender } = render(<EvidenceDisplayFrame model={MODEL} />);
    fireEvent.load(screen.getByTitle("Evidence display"));
    rerender(<EvidenceDisplayFrame model={{ ...MODEL, src: `${MODEL.src}&y` }} />);
    fireEvent.load(screen.getByTitle("Evidence display"));
    expect(posted).not.toHaveBeenCalled();
  });

  it("is full width and a fixed 360 px high", () => {
    render(<EvidenceDisplayFrame model={MODEL} />);
    const classes = screen.getByTitle("Evidence display").classList;
    expect(classes).toContain("w-full");
    expect(classes).toContain("h-[360px]");
    expect([...classes].filter((name) => /^(?:max-|min-)?[hw]-/.test(name)).sort((a, b) => a.localeCompare(b))).toEqual(["h-[360px]", "w-full"]);
  });

  it("calls onLoad with no arguments when the page loads", () => {
    const onLoad = vi.fn();
    render(<EvidenceDisplayFrame model={MODEL} onLoad={onLoad} />);
    fireEvent.load(screen.getByTitle("Evidence display"));
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad.mock.calls[0]).toHaveLength(0);
  });

  it("draws the sheet on the display paper with a light colour scheme", () => {
    render(<EvidenceDisplayFrame model={MODEL} />);
    const classes = [...screen.getByTitle("Evidence display").classList];
    expect(classes).toEqual(expect.arrayContaining(["bg-(--dr-display-paper)", "[color-scheme:light]", "dr-display-frame"]));
    for (const name of ["border", "border-klerosUIComponentsStroke", "rounded-base", "bg-klerosUIComponentsWhiteBackground"]) expect(classes).not.toContain(name);
  });
});
