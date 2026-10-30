import { act, fireEvent, renderHook, screen } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SEARCH_DEBOUNCE_MS, useDisputeSearch } from "./useDisputeSearch";

function RouterPath() {
  return <output>{useLocation().pathname}</output>;
}

const HISTORY_STEPS = [
  ["Back", -1],
  ["Forward", 1],
] as const;

function HistoryButtons() {
  const navigate = useNavigate();
  return HISTORY_STEPS.map(([label, delta]) => (
    <button
      key={label}
      type="button"
      onClick={() => {
        void navigate(delta);
      }}
    >
      {label}
    </button>
  ));
}

function searchControls(search: () => ReturnType<typeof useDisputeSearch>) {
  const press = (name: string) => {
    act(() => {
      fireEvent.click(screen.getByRole("button", { name }));
    });
  };
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
      press("Back");
    },
    forward: () => {
      press("Forward");
    },
  };
}

/**
 * The URL ID is the hook's argument here, not the router's, so a test chooses when a navigation lands: the router
 * commits it in a transition, after the field has already changed.
 */
function renderSearch(urlId: string, earlier: readonly string[] = []) {
  const entries = [...earlier.map((id) => `/1/cases/${id}`), `/1/cases/${urlId}`];
  function wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        {children}
        <RouterPath />
        <HistoryButtons />
      </MemoryRouter>
    );
  }
  const view = renderHook(({ id }: { readonly id: string }) => useDisputeSearch(1, id), { initialProps: { id: urlId }, wrapper });
  return {
    ...searchControls(() => view.result.current),
    land: (id: string) => {
      view.rerender({ id });
    },
  };
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
  return searchControls(() => view.result.current);
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

  it.each([
    { label: "a digit typed and deleted", edits: ["16507", "1650"] },
    { label: "a digit typed, the field cleared and the ID typed again", edits: ["16507", "", "1650"] },
    { label: "the field cleared and the ID typed again", edits: ["", "1650"] },
  ])("edits that end on the starting dispute leave history as it was, so Back leaves it ($label)", ({ edits }) => {
    const { search, routerPath, type, back } = renderSearchWithHistory(["/1/cases/7", "/1/cases/1650"]);
    type(...edits);
    expect(routerPath()).toBe("/1/cases/1650");
    expect(search().pending).toBeNull();
    expect(search().shownId).toBe(1650n);

    back();
    expect(routerPath()).toBe("/1/cases/7");
  });

  it.each(["the debounce", "Enter"])("an edit back to the dispute a lookup left once %s settled it is a new lookup with its own entry", (settledBy) => {
    vi.useFakeTimers();
    const { routerPath, type, enter, back } = renderSearchWithHistory(["/1/cases/7", "/1/cases/100"]);
    type("1000");
    if (settledBy === "Enter") {
      enter();
    } else {
      act(() => {
        vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
      });
    }
    type("100");
    expect(routerPath()).toBe("/1/cases/100");

    back();
    expect(routerPath()).toBe("/1/cases/1000");
    back();
    expect(routerPath()).toBe("/1/cases/100");
    back();
    expect(routerPath()).toBe("/1/cases/7");
  });

  it("while history goes back to the dispute the search started from, that dispute stays shown and the typed ID never loads", () => {
    const { search, routerPath, land } = renderSearch("1650");
    act(() => {
      search().change("16507");
    });
    land("16507");
    act(() => {
      search().change("1650");
    });
    expect(routerPath()).toBe("/1/cases/1650");
    expect(search().pending).not.toBeNull();
    expect(search().shownId).toBe(1650n);

    land("1650");
    expect(search().pending).toBeNull();
    expect(search().shownId).toBe(1650n);
  });

  it("an edit back to the starting dispute before the typed ID's navigation lands waits for both navigations, never loading the typed ID", () => {
    const { search, land } = renderSearch("1650");
    act(() => {
      search().change("16507");
    });
    act(() => {
      search().change("1650");
    });
    land("16507");
    expect(search().pending).not.toBeNull();
    expect(search().shownId).toBe(1650n);

    land("1650");
    expect(search().pending).toBeNull();
    expect(search().shownId).toBe(1650n);
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

  it("typing back to the shown ID before the last search's navigation lands sends the URL back to it once that navigation lands", () => {
    const { search, routerPath, type, land } = renderSearch("1650");
    type("16507", "1650");
    expect(search().shownId).toBe(1650n);

    land("16507");
    expect(routerPath()).toBe("/1/cases/1650");
    expect(search().shownId).toBe(1650n);
  });

  it("an ID typed after the edit back but before the typed ID's navigation lands replaces that entry, never going back", () => {
    const { routerPath, type, land, back } = renderSearch("1650", ["7"]);
    type("16507", "1650", "16508");
    expect(routerPath()).toBe("/1/cases/16508");
    land("16508");
    expect(routerPath()).toBe("/1/cases/16508");

    back();
    expect(routerPath()).toBe("/1/cases/1650");
    back();
    expect(routerPath()).toBe("/1/cases/7");
  });

  it("while history goes back to the starting dispute, the debounce passing loads nothing", () => {
    vi.useFakeTimers();
    const { search, type, land } = renderSearch("1650");
    type("16507");
    land("16507");
    type("1650");
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(search().pending).not.toBeNull();
    expect(search().shownId).toBe(1650n);

    land("1650");
    expect(search().pending).toBeNull();
    expect(search().shownId).toBe(1650n);
  });

  it("an ID typed while history goes back waits for the return, then gets the only entry above the starting dispute", () => {
    vi.useFakeTimers();
    const { search, routerPath, type, land, back } = renderSearch("1650", ["7"]);
    type("16507");
    land("16507");
    type("1650", "16508");
    expect(routerPath()).toBe("/1/cases/1650");
    expect(search().pending).toBe("16508");

    land("1650");
    expect(routerPath()).toBe("/1/cases/16508");
    land("16508");
    expect(search().pending).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(search().pending).toBeNull();
    expect(search().shownId).toBe(16508n);

    back();
    expect(routerPath()).toBe("/1/cases/1650");
    back();
    expect(routerPath()).toBe("/1/cases/7");
  });

  it("retyping the ID history is going back over gives it a fresh entry once the return lands", () => {
    const { routerPath, type, land, back } = renderSearch("1650", ["7"]);
    type("16507");
    land("16507");
    type("1650", "16507");
    expect(routerPath()).toBe("/1/cases/1650");

    land("1650");
    expect(routerPath()).toBe("/1/cases/16507");
    back();
    expect(routerPath()).toBe("/1/cases/1650");
    back();
    expect(routerPath()).toBe("/1/cases/7");
  });

  it("a clear while history goes back leaves the field empty on the starting dispute, and the next ID gets one entry", () => {
    const { search, routerPath, type, land, back } = renderSearch("1650", ["7"]);
    type("16507");
    land("16507");
    type("1650", "");
    land("1650");
    expect(routerPath()).toBe("/1/cases/1650");
    expect(search().pending).toBe("");

    type("16508");
    expect(routerPath()).toBe("/1/cases/16508");
    back();
    expect(routerPath()).toBe("/1/cases/1650");
    back();
    expect(routerPath()).toBe("/1/cases/7");
  });

  it("typing the starting ID again while another ID waits for the return ends the search with history as it was", () => {
    const { search, routerPath, type, land, back } = renderSearch("1650", ["7"]);
    type("16507");
    land("16507");
    type("1650", "16508", "1650");
    land("1650");
    expect(routerPath()).toBe("/1/cases/1650");
    expect(search().pending).toBeNull();
    expect(search().shownId).toBe(1650n);

    back();
    expect(routerPath()).toBe("/1/cases/7");
  });

  it("in the browser, an ID typed before Back over the cancelled entry completes gets the only entry above the starting dispute", async () => {
    const passTask = async () => {
      await act(async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 20);
        });
      });
    };
    globalThis.history.pushState(null, "", "/1/cases/7");
    globalThis.history.pushState(null, "", "/1/cases/1650");
    function wrapper({ children }: { readonly children: ReactNode }) {
      return (
        <StrictMode>
          <BrowserRouter>
            <Routes>
              <Route path="/:chainId/cases/:id?" element={children} />
            </Routes>
          </BrowserRouter>
        </StrictMode>
      );
    }
    const view = renderHook(useSearchOfTheUrl, { wrapper });
    const edit = (text: string) => {
      act(() => {
        view.result.current.change(text);
      });
    };
    edit("16507");
    edit("1650");
    edit("16508");
    await passTask();
    expect(globalThis.location.pathname).toBe("/1/cases/16508");
    act(() => {
      view.result.current.submit();
    });
    expect(view.result.current.shownId).toBe(16508n);

    globalThis.history.back();
    await passTask();
    expect(globalThis.location.pathname).toBe("/1/cases/1650");
    globalThis.history.back();
    await passTask();
    expect(globalThis.location.pathname).toBe("/1/cases/7");
  });
});
