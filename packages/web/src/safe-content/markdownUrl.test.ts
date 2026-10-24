import { describe, expect, it } from "vitest";
import { markdownUrlTransform } from "./markdownUrl";

describe("markdownUrlTransform", () => {
  it.each(["http://example.com", "https://kleros.io/a?b=c#d", "mailto:a@b.co", "tel:+123", "HTTPS://KLEROS.IO", "MailTo:a@b.co"])("keeps the allowed scheme in %s", (url) => {
    expect(markdownUrlTransform(url)).toBe(url);
  });

  it.each(["/cases/1", "#top", "relative/path", "?a=b:c", "#a:b", "//kleros.io/x"])("keeps the relative URL %s", (url) => {
    expect(markdownUrlTransform(url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "\u0001javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "irc://irc.example.com",
    "xmpp:a@b.co",
    "a/b:c",
  ])("refuses %j", (url) => {
    expect(markdownUrlTransform(url)).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(markdownUrlTransform("  https://kleros.io  ")).toBe("https://kleros.io");
  });
});
