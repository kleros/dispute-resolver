import { describe, expect, it } from "vitest";
import { applyColorScheme } from "./theme";

describe("applyColorScheme", () => {
  it("adds the dark class for a dark preference and removes it for a light one", () => {
    const root = document.createElement("html");
    applyColorScheme(root, true);
    expect(root.classList.contains("dark")).toBe(true);
    applyColorScheme(root, false);
    expect(root.classList.contains("dark")).toBe(false);
  });
});
