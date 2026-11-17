/* eslint-disable sonarjs/no-clear-text-protocols -- these tests assert that plain http:// URLs are refused. */
import { describe, expect, it } from "vitest";
import { IMAGE_EXTENSIONS, TEXT_EXTENSIONS, VIDEO_EXTENSIONS } from "./extensions";
import { attachmentKind, isSafeNavigationUrl, resolveArbitrableAppLink, toAttachmentLink } from "./index";
import type { AttachmentKind, GatewayOrigin, SelfHosts } from "./types";
import {
  AUTHORITY_LESS_HTTPS,
  CIDV1,
  DEFAULT_GATEWAY,
  EXPLICIT_AUTHORITY_HTTPS,
  GNOSIS_416_PATH,
  HTTPS_SPELLINGS,
  landingHostsOnAppPages,
  MAINNET_1657_ATTACHMENT_PATH,
  movesOnAppPages,
  T2CR_DISPLAY_CID,
} from "../test/uri/testHelpers";

const GATEWAY: GatewayOrigin = DEFAULT_GATEWAY;
const CID = T2CR_DISPLAY_CID;
const PREVIEW_HOST = "deploy-preview-305--kleros-resolver.netlify.app";
const HOSTS: SelfHosts = { appHost: PREVIEW_HOST, canonicalHosts: ["resolve.kleros.io"] };
const PRODUCTION_HOSTS: SelfHosts = { appHost: "resolve.kleros.io", canonicalHosts: ["resolve.kleros.io"] };
const DANGEROUS_SCHEMES = ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///etc/passwd"];

describe("isSafeNavigationUrl", () => {
  it("accepts an absolute https URL", () => {
    expect(isSafeNavigationUrl("https://kleros.io")).toBe(true);
    expect(isSafeNavigationUrl(" https://curate.kleros.io/tcr/100/0x1?x=1#y ")).toBe(true);
    expect(isSafeNavigationUrl("HTTPS://kleros.io")).toBe(true);
  });

  it("rejects protocol-relative, http and dangerous schemes", () => {
    const inputs = [
      "//kleros.io/path",
      "http://kleros.io",
      "ftp://kleros.io",
      ...DANGEROUS_SCHEMES,
      " javascript:alert(1)",
      "javascript:alert('https://x')",
      "http://evil.example/?u=https://x",
      "https://",
      "https://a b.example",
      "/relative/path",
      "kleros.io",
      "",
      "   ",
    ];
    for (const input of inputs) expect(isSafeNavigationUrl(input), input).toBe(false);
  });

  it("rejects non-strings", () => {
    for (const input of [undefined, null, 42, {}, new URL("https://kleros.io")]) expect(isSafeNavigationUrl(input)).toBe(false);
  });

  it("rejects an https reference without an explicit authority, which a browser resolves against the current page", () => {
    for (const input of AUTHORITY_LESS_HTTPS) expect(isSafeNavigationUrl(input), input).toBe(false);
  });

  it("an accepted URL leads where it was checked from every page of the app", () => {
    const accepted = HTTPS_SPELLINGS.filter((input) => isSafeNavigationUrl(input));
    expect(accepted).toEqual(EXPLICIT_AUTHORITY_HTTPS);
    expect(accepted.filter(movesOnAppPages)).toEqual([]);
  });
});

describe("toAttachmentLink", () => {
  it("links every accepted IPFS spelling through the gateway", () => {
    const href = `${DEFAULT_GATEWAY}/ipfs/${CID}/photo.png`;
    for (const uri of [`/ipfs/${CID}/photo.png`, `ipfs/${CID}/photo.png`, `ipfs://${CID}/photo.png`, `${CID}/photo.png`]) {
      expect(toAttachmentLink(uri, GATEWAY), uri).toEqual({ kind: "link", href, label: "photo.png", attachmentKind: "image" });
    }
  });

  it("links a bare CID through the gateway, labelled with the CID", () => {
    expect(toAttachmentLink(CIDV1, GATEWAY)).toEqual({ kind: "link", href: `${DEFAULT_GATEWAY}/ipfs/${CIDV1}`, label: CIDV1, attachmentKind: "other" });
  });

  it("links the %20-encoded document of Gnosis 416, labelled with its last path segment", () => {
    const label = GNOSIS_416_PATH.slice(GNOSIS_416_PATH.lastIndexOf("/") + 1);
    expect(toAttachmentLink(GNOSIS_416_PATH, GATEWAY)).toEqual({ kind: "link", href: `${DEFAULT_GATEWAY}${GNOSIS_416_PATH}`, label, attachmentKind: "other" });
  });

  it("links an attachment whose file name contains C1 characters through the gateway", () => {
    const encodedName = "Response%20to%20%C3%A2%C2%80%C2%9C'The%20new%20candidate'%20justification%20for%20Invalid%20stands%C3%A2%C2%80%C2%9D.pdf";
    expect(toAttachmentLink(MAINNET_1657_ATTACHMENT_PATH, GATEWAY)).toEqual({
      kind: "link",
      href: `${DEFAULT_GATEWAY}/ipfs/QmRXgRaKkcKKfXjTFozwoWLosFHmtcEaeuj1cL1G8xKHJd/${encodedName}`,
      label: MAINNET_1657_ATTACHMENT_PATH.slice(MAINNET_1657_ATTACHMENT_PATH.lastIndexOf("/") + 1),
      attachmentKind: "other",
    });
  });

  it("links an https attachment as is", () => {
    expect(toAttachmentLink("https://example.org/files/report.txt", GATEWAY)).toEqual({
      kind: "link",
      href: "https://example.org/files/report.txt",
      label: "report.txt",
      attachmentKind: "text",
    });
    expect(toAttachmentLink("https://example.org/report.pdf?x=1", GATEWAY)).toMatchObject({ href: "https://example.org/report.pdf?x=1", label: "report.pdf?x=1" });
    expect(toAttachmentLink("https://example.org/files/", GATEWAY)).toMatchObject({ href: "https://example.org/files/", label: "" });
  });

  it("re-serves an https attachment on a dead gateway host from the configured gateway", () => {
    expect(toAttachmentLink(`https://ipfs.kleros.io/ipfs/${CID}/clip.mp4`, GATEWAY)).toEqual({
      kind: "link",
      href: `${DEFAULT_GATEWAY}/ipfs/${CID}/clip.mp4`,
      label: "clip.mp4",
      attachmentKind: "video",
    });
  });

  it("an http:// attachment outside /ipfs/<CID> is shown as text", () => {
    const inputs = [
      "http://example.org/report.pdf",
      "http://h/ipfs/not-a-cid/report.pdf",
      "http://h/ipns/x/report.pdf",
      `http:/h/ipfs/${CID}/report.pdf`,
      `http://h/ipfs/${CID}/../../ipns/x/report.pdf`,
    ];
    for (const input of inputs) expect(toAttachmentLink(input, GATEWAY), input).toEqual({ kind: "text", text: input });
  });

  it("an http:// attachment whose path is /ipfs/<CID> links through the gateway", () => {
    expect(toAttachmentLink(`http://ipfs.kleros.io/ipfs/${CID}/report.pdf`, GATEWAY)).toEqual({
      kind: "link",
      href: `${DEFAULT_GATEWAY}/ipfs/${CID}/report.pdf`,
      label: "report.pdf",
      attachmentKind: attachmentKind("report.pdf"),
    });
  });

  it("shows dangerous schemes, protocol-relative URLs and mutable paths as text", () => {
    const inputs = [...DANGEROUS_SCHEMES, "//evil.example/report.pdf", "/ipns/kleros.io/report.pdf", `/ipfs/${CID}/../../ipns/x`, "report.pdf"];
    for (const input of inputs) expect(toAttachmentLink(input, GATEWAY), input).toEqual({ kind: "text", text: input });
  });

  it("gives no attachment for an empty or non-string value", () => {
    for (const input of [undefined, null, "", "   ", 42, {}]) expect(toAttachmentLink(input, GATEWAY)).toBeNull();
  });
});

describe("resolveArbitrableAppLink", () => {
  it("links an https arbitrable application", () => {
    expect(resolveArbitrableAppLink("https://curate.kleros.io/tcr/100/0xabc", HOSTS)).toBe("https://curate.kleros.io/tcr/100/0xabc");
    expect(resolveArbitrableAppLink("  https://curate.kleros.io/  ", HOSTS)).toBe("https://curate.kleros.io/");
  });

  it("hides the self-link the default script and the create flow emit", () => {
    expect(resolveArbitrableAppLink("https://resolve.kleros.io", HOSTS)).toBeNull();
    expect(resolveArbitrableAppLink("https://resolve.kleros.io/1/cases/1700", HOSTS)).toBeNull();
    expect(resolveArbitrableAppLink(`https://${PREVIEW_HOST}/100/cases/3`, HOSTS)).toBeNull();
  });

  it("hides a self-link whatever the case, default port or trailing dot of its host or the app's, and whatever the dev server's port", () => {
    const selfLinks: [string, SelfHosts][] = [
      ["https://RESOLVE.Kleros.io:443/", HOSTS],
      ["https://resolve.kleros.io./1/cases/5", HOSTS],
      [`https://${PREVIEW_HOST}./1/ongoing`, HOSTS],
      ["https://resolve.kleros.io/", { appHost: "Resolve.Kleros.IO", canonicalHosts: [] }],
      ["https://resolve.kleros.io/", { appHost: "resolve.kleros.io.", canonicalHosts: [] }],
      ["https://localhost/", { appHost: "localhost:5173", canonicalHosts: ["resolve.kleros.io"] }],
    ];
    for (const [url, hosts] of selfLinks) expect(resolveArbitrableAppLink(url, hosts), url).toBeNull();
  });

  it("keeps a link that only mentions resolve.kleros.io outside its host, matching hosts exactly and never by substring", () => {
    const urls = [
      "https://example.org/?from=resolve.kleros.io",
      "https://resolve.kleros.io.evil.example/",
      "https://resolve.kleros.io.evil.example./",
      "https://evil.example/?next=resolve.kleros.io",
      "https://evil.example/resolve.kleros.io",
      "https://notresolve.kleros.io/",
      "https://kleros.io/",
      "https://resolve.kleros.io@evil.example/",
    ];
    for (const url of urls) expect(resolveArbitrableAppLink(url, HOSTS), url).toBe(url);
  });

  it("hides nothing when neither the app's host nor a canonical host is usable", () => {
    expect(resolveArbitrableAppLink("https://resolve.kleros.io/", { appHost: "", canonicalHosts: ["", "not a host"] })).toBe("https://resolve.kleros.io/");
  });

  it("gives no link for a value that is not an https URL", () => {
    for (const input of ["http://curate.kleros.io", "//curate.kleros.io", "resolve.kleros.io", ...DANGEROUS_SCHEMES, "", undefined, null, 42]) {
      expect(resolveArbitrableAppLink(input, HOSTS), String(input)).toBeNull();
    }
  });

  it("hides a self-link spelled without an authority", () => {
    expect(resolveArbitrableAppLink("https:/1/cases/5", PRODUCTION_HOSTS)).toBeNull();
    for (const input of AUTHORITY_LESS_HTTPS) expect(resolveArbitrableAppLink(input, PRODUCTION_HOSTS), input).toBeNull();
  });

  it("a returned link lands where the self-link check looked, never on the app, from every page of the app", () => {
    const links = HTTPS_SPELLINGS.map((input) => resolveArbitrableAppLink(input, PRODUCTION_HOSTS)).filter((link) => link !== null);
    expect(links).toHaveLength(EXPLICIT_AUTHORITY_HTTPS.length);
    expect(links.filter(movesOnAppPages)).toEqual([]);
    expect(links.flatMap(landingHostsOnAppPages)).not.toContain("resolve.kleros.io");
  });
});

describe("attachmentKind", () => {
  it("picks the icon from the extension, image before video before text", () => {
    const cases: readonly (readonly [string, AttachmentKind])[] = [
      ["photo.png", "image"],
      ["photo.JPG", "image"],
      ["drawing.svg", "image"],
      ["animation.mng", "image"],
      ["clip.mp4", "video"],
      ["clip.webm", "video"],
      ["sound.ogg", "video"],
      ["notes.txt", "text"],
      ["evidence.json", "text"],
      ["README.md", "text"],
      ["report.pdf", "other"],
      ["archive.zip", "other"],
      [`/ipfs/${CID}`, "other"],
      [CIDV1, "other"],
      ["", "other"],
    ];
    for (const [input, kind] of cases) expect(attachmentKind(input), input).toBe(kind);
  });

  it("leaves out the capitalized extension entries, which a lowercase match never hits", () => {
    expect([IMAGE_EXTENSIONS.size, VIDEO_EXTENSIONS.size, TEXT_EXTENSIONS.size]).toEqual([110, 34, 324]);
    for (const extension of [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS, ...TEXT_EXTENSIONS]) expect(extension).toBe(extension.toLowerCase());
  });

  it("reads the extension of the last path segment of a path or URL", () => {
    expect(attachmentKind(`/ipfs/${CID}/photo.png`)).toBe("image");
    expect(attachmentKind(`https://example.org/a.b/clip.mov`)).toBe("video");
    expect(attachmentKind("https://example.org/photo.png?width=200#top")).toBe("image");
    expect(attachmentKind("https://example.org/files/")).toBe("other");
    expect(attachmentKind("https://example.org/dir.png/")).toBe("image");
    expect(attachmentKind("/files/.png")).toBe("other");
    expect(attachmentKind("/files/photo.")).toBe("other");
  });
});
