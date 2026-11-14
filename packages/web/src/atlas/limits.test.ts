import { describe, expect, it } from "vitest";
import { TEST_SERVER_ROLES } from "../test/atlas";
import { formatSize, isMimeAllowed, limitsChoice, limitsHint, refuseFile, roleLimits } from "./limits";

const MIB = 1024 * 1024;

describe("roleLimits", () => {
  it("reads the evidence and policy roles of the server's answer, named by the library enum's keys", () => {
    expect(roleLimits(TEST_SERVER_ROLES, "evidence")).toEqual({ maxSize: 20 * MIB, allowedMimeTypes: ["application/pdf", "image/*"] });
    expect(roleLimits(TEST_SERVER_ROLES, "policy")).toEqual({ maxSize: MIB, allowedMimeTypes: ["application/json"] });
  });

  it("is unknown while the server has not answered", () => {
    expect(roleLimits(undefined, "evidence")).toBeNull();
  });

  it("ignores roles the library would not match and malformed entries", () => {
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

  it("refuses a type the role does not allow", () => {
    expect(refuseFile(new File(["<p>"], "page.html", { type: "text/html" }), limits)).toBe("mime-not-allowed");
    expect(refuseFile(new File(["x"], "no-type"), limits)).toBe("mime-not-allowed");
  });

  it("accepts exact types and every subtype of a type/* entry, as the library does", () => {
    expect(isMimeAllowed("application/pdf", limits.allowedMimeTypes)).toBe(true);
    expect(isMimeAllowed("image/png", limits.allowedMimeTypes)).toBe(true);
    expect(isMimeAllowed("application/pdfx", limits.allowedMimeTypes)).toBe(false);
    expect(isMimeAllowed("imagex/png", limits.allowedMimeTypes)).toBe(false);
  });

  it("refuses a file over the role's maxSize and accepts one at the limit", () => {
    expect(refuseFile(new File([new Uint8Array(MIB + 1)], "big.pdf", { type: "application/pdf" }), limits)).toBe("too-large");
    expect(refuseFile(new File([new Uint8Array(MIB)], "fits.pdf", { type: "application/pdf" }), limits)).toBeNull();
  });
});

describe("formatSize", () => {
  it("shows the server's limit in readable units", () => {
    expect(formatSize(20 * MIB)).toBe("20 MB");
    expect(formatSize(1.5 * MIB)).toBe("1.5 MB");
    expect(formatSize(512 * 1024)).toBe("512 KB");
    expect(formatSize(100)).toBe("100 bytes");
  });
});

describe("limitsHint and limitsChoice", () => {
  it("name the accepted types as readable groups, with the size limit", () => {
    const limits = { maxSize: 20 * MIB, allowedMimeTypes: ["application/pdf", "image/*", "text/plain"] };

    expect(limitsHint(limits)).toBe("PDF, image or text, up to 20 MB.");
    expect(limitsChoice(limits)).toBe("Choose a PDF, an image or a text file, up to 20 MB.");
  });

  it("join two groups with or and name a single group alone", () => {
    expect(limitsHint({ maxSize: 20 * MIB, allowedMimeTypes: ["application/pdf", "image/*"] })).toBe("PDF or image, up to 20 MB.");
    expect(limitsChoice({ maxSize: MIB, allowedMimeTypes: ["application/json"] })).toBe("Choose a JSON file, up to 1 MB.");
  });

  it("name a group once when several entries fall in it", () => {
    const limits = { maxSize: MIB, allowedMimeTypes: ["text/*", "text/plain", "application/pdf", "application/pdf"] };

    expect(limitsHint(limits)).toBe("Text or PDF, up to 1 MB.");
  });

  it("fall back to the raw type for a type outside the known groups, after the groups", () => {
    const limits = { maxSize: MIB, allowedMimeTypes: ["application/zip", "application/pdf", "image/png"] };

    expect(limitsHint(limits)).toBe("PDF, application/zip or image/png, up to 1 MB.");
    expect(limitsChoice(limits)).toBe("Choose a PDF, application/zip or image/png, up to 1 MB.");
  });

  it("give only the size when the server lists no type", () => {
    expect(limitsHint({ maxSize: MIB, allowedMimeTypes: [] })).toBe("Up to 1 MB.");
    expect(limitsChoice({ maxSize: MIB, allowedMimeTypes: [] })).toBe("Choose a file up to 1 MB.");
  });

  it("treat a server type named like an object property as an unknown type", () => {
    expect(limitsHint({ maxSize: MIB, allowedMimeTypes: ["constructor"] })).toBe("Constructor, up to 1 MB.");
  });
});
