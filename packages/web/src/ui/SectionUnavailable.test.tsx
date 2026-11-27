import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { deferred } from "../test/data";
import { SectionUnavailable } from "./SectionUnavailable";

const BAD_DATA = { code: "invalid-data", message: "Bad data." } as const;

describe("SectionUnavailable", () => {
  it("offers no Retry without a handler", () => {
    render(<SectionUnavailable section="Timeline" error={BAD_DATA} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps its Retry busy, named after the section, until the re-read it started settles", async () => {
    const read = deferred<undefined>();
    render(<SectionUnavailable section="Timeline" error={BAD_DATA} onRetry={() => read.promise} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Retry Timeline" }));

    expect(screen.getByRole("button", { name: "Retry Timeline" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Retry Timeline" }).querySelector(".button-loading")).not.toBeNull();
    await act(async () => {
      read.resolve(undefined);
      await read.promise;
    });
    expect(screen.getByRole("button", { name: "Retry Timeline" })).not.toHaveAttribute("aria-disabled");
  });
});
