import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EvidenceDisplayFrame } from "./EvidenceDisplayFrame";
import type { EvidenceDisplayModel } from "./types";

const MODEL: EvidenceDisplayModel = {
  src: "https://cdn.kleros.link/ipfs/QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh/index.html?x",
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
  it("renders the computed source and sandbox", () => {
    render(<EvidenceDisplayFrame model={MODEL} />);
    const frame = screen.getByTitle("Evidence display");
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", MODEL.src);
    expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
    expect(frame).not.toHaveAttribute("allow");
    expect(frame).not.toHaveAttribute("referrerpolicy");
    expect(frame).toHaveClass("dr-display-frame", "[color-scheme:light]");
  });

  it("sets the sandbox before the source, so the frame never loads unsandboxed", () => {
    render(<EvidenceDisplayFrame model={{ ...MODEL, sandbox: ["allow-scripts"] }} />);
    const names = screen.getByTitle("Evidence display").getAttributeNames();
    expect(names.filter((name) => name === "sandbox" || name === "src")).toEqual(["sandbox", "src"]);
  });

  it("calls onLoad with no arguments when the page loads", () => {
    const onLoad = vi.fn();
    render(<EvidenceDisplayFrame model={MODEL} onLoad={onLoad} />);
    fireEvent.load(screen.getByTitle("Evidence display"));
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad.mock.calls[0]).toHaveLength(0);
  });
});
