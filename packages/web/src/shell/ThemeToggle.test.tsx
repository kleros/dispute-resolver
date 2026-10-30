import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createColorSchemeStore } from "../theme";
import { ColorSchemeProvider } from "./colorScheme";
import { ThemeToggle } from "./ThemeToggle";

function renderToggle() {
  const root = document.createElement("div");
  const store = createColorSchemeStore({ root, media: null, storage: null });
  render(
    <ColorSchemeProvider store={store}>
      <ThemeToggle />
    </ColorSchemeProvider>,
  );
  return { root, store };
}

describe("ThemeToggle", () => {
  it("names the action it will take and flips the theme on click", async () => {
    const user = userEvent.setup();
    const { root } = renderToggle();
    const swap = screen.getByRole("button", { name: "Switch to dark theme" }).querySelector("[data-icon-swap]");
    expect(swap).toHaveAttribute("data-state", "light");
    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(root.classList.contains("dark")).toBe(true);
    expect(swap).toHaveAttribute("data-state", "dark");
    const button = screen.getByRole("button", { name: "Switch to light theme" });
    expect(button).not.toHaveAttribute("aria-pressed");
    await user.click(button);
    expect(root.classList.contains("dark")).toBe(false);
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
  });

  it("reflects a theme change made elsewhere", () => {
    const { store } = renderToggle();
    act(() => {
      store.toggle();
    });
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });
});
