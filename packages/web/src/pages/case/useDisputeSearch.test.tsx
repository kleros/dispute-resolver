import { act, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { useDisputeSearch } from "./useDisputeSearch";

function RouterPath() {
  return <output>{useLocation().pathname}</output>;
}

/**
 * The URL ID is the hook's argument here, not the router's, so a test chooses when a navigation lands: the router
 * commits it in a transition, after the field has already changed.
 */
function renderSearch(urlId: string) {
  function wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[`/1/cases/${urlId}`]}>
        {children}
        <RouterPath />
      </MemoryRouter>
    );
  }
  const view = renderHook(({ id }: { readonly id: string }) => useDisputeSearch(1, id), { initialProps: { id: urlId }, wrapper });
  return {
    search: () => view.result.current,
    routerPath: () => screen.getByRole("status").textContent,
    land: (id: string) => {
      view.rerender({ id });
    },
  };
}

describe("useDisputeSearch", () => {
  it("a clear made before the last search's navigation lands still leaves the field empty", () => {
    const { search, routerPath, land } = renderSearch("1650");
    act(() => {
      search().change("16507");
    });
    act(() => {
      search().change("");
    });
    land("16507");
    expect(routerPath()).toBe("/1/cases/16507");
    expect(search().pending).toBe("");
    expect(search().shownId).toBeNull();
  });

  it("typing back to the shown ID before the last search's navigation lands sends the URL back to it", () => {
    const { search, routerPath } = renderSearch("1650");
    act(() => {
      search().change("16507");
    });
    act(() => {
      search().change("1650");
    });
    expect(routerPath()).toBe("/1/cases/1650");
    expect(search().shownId).toBe(1650n);
  });
});
