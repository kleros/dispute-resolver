import { describe, expect, it } from "vitest";
import { courtCaseUrl } from "./courtCaseUrl";

describe("courtCaseUrl", () => {
  it("A18: builds the Court case link of spec 5.2 and 5.13", () => {
    expect(courtCaseUrl(1658n, 1)).toBe("https://court.kleros.io/cases/1658?requiredChainId=1");
    expect(courtCaseUrl(121n, 100)).toBe("https://court.kleros.io/cases/121?requiredChainId=100");
  });

  it.each([0n, -1n, 2n ** 256n - 1n])("A18: keeps the Court origin and a single path segment for the hostile ID %s", (id) => {
    const url = new URL(courtCaseUrl(id, 11155111));
    expect(url.origin).toBe("https://court.kleros.io");
    expect(url.pathname).toBe(`/cases/${id.toString()}`);
    expect([...url.searchParams.entries()]).toEqual([["requiredChainId", "11155111"]]);
  });
});
