import { describe, expect, it } from "vitest";
import { filterFromParam } from "./periodFilter";

describe("period filter options", () => {
  it("reads each option's ID from the address and anything else as every open dispute", () => {
    expect(filterFromParam("evidence")).toBe(0);
    expect(filterFromParam("commit")).toBe(1);
    expect(filterFromParam("voting")).toBe(2);
    expect(filterFromParam("appeal")).toBe(3);
    expect(filterFromParam("all")).toBe("all");
    expect(filterFromParam(null)).toBe("all");
    expect(filterFromParam("Appeal")).toBe("all");
    expect(filterFromParam("4")).toBe("all");
  });
});
