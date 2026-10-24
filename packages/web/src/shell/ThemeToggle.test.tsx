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
    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(root.classList.contains("dark")).toBe(true);
    const button = screen.getByRole("button", { name: "Switch to light theme" });
    expect(button).not.toHaveAttribute("aria-pressed");
    await user.click(button);
    expect(root.classList.contains("dark")).toBe(false);
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toBeInTheDocument();
  });

  it("keeps both icons in one cell and cross-fades them on a flip, with no transition under reduced motion", async () => {
    const user = userEvent.setup();
    renderToggle();
    const button = screen.getByRole("button", { name: "Switch to dark theme" });
    const swap = button.querySelector("[data-icon-swap]");
    expect(swap).toHaveAttribute("data-state", "light");
    expect(swap).toHaveClass("inline-grid");
    const [sun, moon] = Array.from(button.querySelectorAll("svg"));
    for (const icon of [sun, moon]) {
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon).toHaveClass("[grid-area:1/1]", "transition-[opacity,filter,scale]", "duration-250", "motion-reduce:transition-none");
    }
    expect(moon).toHaveClass("opacity-100", "scale-100");
    expect(sun).toHaveClass("opacity-0", "scale-25", "[filter:blur(2px)]");
    expect(button).toHaveClass("transition-[background-color]", "duration-150", "motion-reduce:transition-none");
    expect(button).not.toHaveClass("transition-colors");

    await user.click(button);
    expect(swap).toHaveAttribute("data-state", "dark");
    expect(sun).toHaveClass("opacity-100", "scale-100");
    expect(moon).toHaveClass("opacity-0", "scale-25");
  });

  it("reflects a theme change made elsewhere", () => {
    const { store } = renderToggle();
    act(() => {
      store.toggle();
    });
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
  });
});
