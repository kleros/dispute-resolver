import { describe, expect, it } from "vitest";
import { TEST_SERVER_ROLES } from "../test/atlas";
import { formatSize, isMimeAllowed, refuseFile, roleLimits } from "./limits";

const MIB = 1024 * 1024;

describe("roleLimits", () => {
  it("A16: reads the evidence and policy roles of the server's answer, named by the library enum's keys", () => {
    expect(roleLimits(TEST_SERVER_ROLES, "evidence")).toEqual({ maxSize: 20 * MIB, allowedMimeTypes: ["application/pdf", "image/*"] });
    expect(roleLimits(TEST_SERVER_ROLES, "policy")).toEqual({ maxSize: MIB, allowedMimeTypes: ["application/json"] });
  });

  it("D-42: is unknown while the server has not answered", () => {
    expect(roleLimits(undefined, "evidence")).toBeNull();
  });

  it("B16: ignores roles the library would not match and malformed entries", () => {
    const roles = [
      { name: "evidence", restriction: { maxSize: MIB, allowedMimeTypes: ["*/*"] } },
      { name: "constructor", restriction: { maxSize: MIB, allowedMimeTypes: ["*/*"] } },
      { name: "Evidence", restriction: { maxSize: "huge", allowedMimeTypes: ["*/*"] } },
      { name: "Evidence", restriction: { maxSize: -1, allowedMimeTypes: ["*/*"] } },
      null,
    ];
    expect(roleLimits(roles, "evidence")).toBeNull();
    expect(roleLimits({ Evidence: TEST_SERVER_ROLES[0] }, "evidence")).toBeNull();
  });
});

describe("refuseFile", () => {
  const limits = { maxSize: MIB, allowedMimeTypes: ["application/pdf", "image/*"] };

  it("B16: refuses a type the role does not allow", () => {
    expect(refuseFile(new File(["<p>"], "page.html", { type: "text/html" }), limits)).toBe("mime-not-allowed");
    expect(refuseFile(new File(["x"], "no-type"), limits)).toBe("mime-not-allowed");
  });

  it("B16: accepts exact types and every subtype of a type/* entry, as the library does", () => {
    expect(isMimeAllowed("application/pdf", limits.allowedMimeTypes)).toBe(true);
    expect(isMimeAllowed("image/png", limits.allowedMimeTypes)).toBe(true);
    expect(isMimeAllowed("application/pdfx", limits.allowedMimeTypes)).toBe(false);
    expect(isMimeAllowed("imagex/png", limits.allowedMimeTypes)).toBe(false);
  });

  it("B16: refuses a file over the role's maxSize and accepts one at the limit", () => {
    expect(refuseFile(new File([new Uint8Array(MIB + 1)], "big.pdf", { type: "application/pdf" }), limits)).toBe("too-large");
    expect(refuseFile(new File([new Uint8Array(MIB)], "fits.pdf", { type: "application/pdf" }), limits)).toBeNull();
  });
});

describe("formatSize", () => {
  it("D-42: shows the server's limit in readable units", () => {
    expect(formatSize(20 * MIB)).toBe("20 MB");
    expect(formatSize(1.5 * MIB)).toBe("1.5 MB");
    expect(formatSize(512 * 1024)).toBe("512 KB");
    expect(formatSize(100)).toBe("100 bytes");
  });
});
