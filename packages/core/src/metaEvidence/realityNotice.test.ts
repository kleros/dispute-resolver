import { describe, expect, it } from "vitest";
import { realityNotice } from "./index";

describe("realityNotice (§5.10)", () => {
  it("§5.10: no notice without a Reality status, or for a verified question that does not diverge", () => {
    expect(realityNotice(null)).toEqual({ kind: "none", title: null });
    expect(realityNotice({ status: "verified", divergent: false })).toEqual({ kind: "none", title: null });
    expect(realityNotice({ status: "verified" })).toEqual({ kind: "none", title: null });
  });

  it("§5.10: one notice per status, in the fixed priority order", () => {
    expect(realityNotice({ status: "unresolvable", divergent: true })).toEqual({ kind: "unresolvable", title: null });
    expect(realityNotice({ status: "unverified", divergent: true })).toEqual({ kind: "unverified", title: null });
    expect(realityNotice({ status: "malformed", divergent: true })).toEqual({ kind: "divergent", title: null });
    expect(realityNotice({ status: "verified", divergent: true })).toEqual({ kind: "divergent", title: null });
    expect(realityNotice({ status: "malformed", divergent: false })).toEqual({ kind: "malformed", title: null });
  });

  it("§5.10: the on-chain title is carried with the notice", () => {
    expect(realityNotice({ status: "malformed", title: "Will it rain?\nTomorrow" })).toEqual({ kind: "malformed", title: "Will it rain?\nTomorrow" });
  });

  it("§5.10: the title is carried even when no notice shows, and renders nothing on its own", () => {
    expect(realityNotice({ status: "verified", divergent: false, title: "Will it rain?" })).toEqual({ kind: "none", title: "Will it rain?" });
  });
});
