import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SectionUnavailable } from "./SectionUnavailable";

describe("SectionUnavailable", () => {
  it("D-36: shows '{section} unavailable' with core's reason", () => {
    render(<SectionUnavailable section="Evidence" error={{ code: "rpc-error", message: "The RPC endpoint did not answer." }} />);
    expect(screen.getByText("Evidence unavailable")).toBeInTheDocument();
    expect(screen.getByText("The RPC endpoint did not answer.")).toBeInTheDocument();
  });

  it("D-36: offers no Retry without a handler", () => {
    render(<SectionUnavailable section="Timeline" error={{ code: "invalid-data", message: "Bad data." }} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("D-36: Retry calls the handler", async () => {
    const onRetry = vi.fn();
    render(<SectionUnavailable section="Appeal" error={{ code: "reverted", message: "Reverted." }} onRetry={onRetry} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry Appeal" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
