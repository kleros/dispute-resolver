import { act, fireEvent, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SEARCH_DEBOUNCE_MS, useDisputeSearch } from "./useDisputeSearch";

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

function HistoryButtons() {
  const navigate = useNavigate();
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void navigate(-1);
        }}
      >
        Back
      </button>
      <button
        type="button"
        onClick={() => {
          void navigate(1);
        }}
      >
        Forward
      </button>
    </>
  );
}

function useSearchOfTheUrl() {
  return useDisputeSearch(1, useParams().id);
}

/** The URL ID comes from the router here, so Back reaches the hook the way it does on the page. */
function renderSearchWithHistory(entries: readonly string[]) {
  function wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[...entries]} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/:chainId/cases/:id?" element={children} />
        </Routes>
        <RouterPath />
        <HistoryButtons />
      </MemoryRouter>
    );
  }
  const view = renderHook(useSearchOfTheUrl, { wrapper });
  const search = () => view.result.current;
  return {
    search,
    routerPath: () => screen.getByRole("status").textContent,
    type: (...texts: readonly string[]) => {
      for (const text of texts) {
        act(() => {
          search().change(text);
        });
      }
    },
    enter: () => {
      act(() => {
        search().submit();
      });
    },
    back: () => {
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
      });
    },
    forward: () => {
      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "Forward" }));
      });
    },
  };
}

describe("useDisputeSearch", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("typing a new ID over a loaded dispute adds one history entry, so Back returns to the dispute it left", () => {
    const { search, routerPath, type, enter, back } = renderSearchWithHistory(["/1/cases/7", "/1/cases/1000"]);
    type("1", "10", "100", "1001");
    expect(routerPath()).toBe("/1/cases/1001");
    enter();

    back();
    expect(routerPath()).toBe("/1/cases/1000");
    expect(search().pending).toBeNull();
    expect(search().shownId).toBe(1000n);
    back();
    expect(routerPath()).toBe("/1/cases/7");
  });

  it("an ID typed into the cleared field still gets its own entry, though the clear itself changed no URL", () => {
    const { routerPath, type, enter, back } = renderSearchWithHistory(["/1/cases/7", "/1/cases/1000"]);
    type("");
    expect(routerPath()).toBe("/1/cases/1000");
    type("1", "12");
    expect(routerPath()).toBe("/1/cases/12");
    enter();

    back();
    expect(routerPath()).toBe("/1/cases/1000");
  });

  it("Back while the new lookup still waits for the debounce ends the search and shows the dispute it returned to", () => {
    const { search, routerPath, type, back } = renderSearchWithHistory(["/1/cases/7", "/1/cases/1000"]);
    type("1001");
    back();
    expect(routerPath()).toBe("/1/cases/1000");
    expect(search().pending).toBeNull();
    expect(search().shownId).toBe(1000n);
  });

  it("an ID typed after that Back starts a new search with its own entry, keeping the dispute it returned to", () => {
    const { routerPath, type, back } = renderSearchWithHistory(["/1/cases/7", "/1/cases/1000"]);
    type("1001");
    back();
    type("10012");
    expect(routerPath()).toBe("/1/cases/10012");

    back();
    expect(routerPath()).toBe("/1/cases/1000");
  });

  it("Forward to a lookup that Back left before its debounce shows it as a loaded dispute, so the next ID gets its own entry", () => {
    const { search, routerPath, type, enter, back, forward } = renderSearchWithHistory(["/1/cases/1000"]);
    type("1001");
    back();
    forward();
    expect(routerPath()).toBe("/1/cases/1001");
    expect(search().pending).toBeNull();
    expect(search().shownId).toBe(1001n);

    type("1002");
    enter();
    back();
    expect(routerPath()).toBe("/1/cases/1001");
    back();
    expect(routerPath()).toBe("/1/cases/1000");
  });

  it("Forward to a lookup whose field was cleared before Back shows that dispute, not the cleared field", () => {
    const { search, routerPath, type, back, forward } = renderSearchWithHistory(["/1/cases/1000"]);
    type("1001", "");
    expect(search().pending).toBe("");
    back();
    forward();
    expect(routerPath()).toBe("/1/cases/1001");
    expect(search().pending).toBeNull();
    expect(search().shownId).toBe(1001n);
  });

  it("Back to the empty lookup page ends the search, and Forward then shows the dispute it had found", () => {
    const { search, routerPath, type, back, forward } = renderSearchWithHistory(["/1/cases"]);
    type("1001");
    expect(routerPath()).toBe("/1/cases/1001");
    back();
    expect(routerPath()).toBe("/1/cases");
    expect(search().pending).toBeNull();
    expect(search().shownId).toBeNull();

    forward();
    expect(search().pending).toBeNull();
    expect(search().shownId).toBe(1001n);
    type("10012");
    back();
    expect(routerPath()).toBe("/1/cases/1001");
  });

  it("each lookup that settled, by the debounce or by Enter, keeps its own entry", () => {
    vi.useFakeTimers();
    const { search, routerPath, type, enter, back } = renderSearchWithHistory(["/1/cases/1000"]);
    type("1001");
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(search().pending).toBeNull();
    type("1002");
    enter();
    type("1003");
    expect(routerPath()).toBe("/1/cases/1003");

    back();
    expect(routerPath()).toBe("/1/cases/1002");
    back();
    expect(routerPath()).toBe("/1/cases/1001");
    expect(search().shownId).toBe(1001n);
    back();
    expect(routerPath()).toBe("/1/cases/1000");
  });

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
