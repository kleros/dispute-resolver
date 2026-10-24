import { parseDisputeId, type ChainId } from "@dispute-resolver/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { paths } from "../../routing";

export const SEARCH_DEBOUNCE_MS = 750;

export interface DisputeSearch {
  /** The typed text still waiting for the debounce, or `null` when the page shows the URL's dispute. */
  readonly pending: string | null;
  readonly shownId: bigint | null;
  /** Text that is neither empty nor a dispute ID is ignored. */
  change(text: string): void;
  submit(): void;
}

/** The router commits the URL in a transition, after the text, so the search holds on both the old and the new URL ID. */
interface Search {
  readonly text: string;
  readonly from: string | undefined;
  readonly to: string | undefined;
  /** Whether the search has added its history entry; a clear changes no URL, so it adds none. */
  readonly navigated: boolean;
}

function targetOf(text: string): string {
  return parseDisputeId(text)?.toString() ?? "";
}

/** An ID that does not parse is its own target, so clearing the field still leaves it. */
function urlTarget(urlId: string | undefined): string {
  if (urlId === undefined) return "";
  return parseDisputeId(urlId)?.toString() ?? `unparsed:${urlId}`;
}

/**
 * Every change sets the URL at once, built only from the parsed ID; only the load of that ID waits for the debounce or
 * for Enter. A search's first URL gets a new history entry and its later ones replace it, so Back returns to the dispute
 * it left. An empty field shows no dispute and leaves the URL as it is. A change of the URL the search did not make
 * (back, a header link) ends the pending search.
 */
export function useDisputeSearch(chainId: ChainId, urlId: string | undefined): DisputeSearch {
  const navigate = useNavigate();
  const [search, setSearch] = useState<Search | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The URL a search left holds it only until the search's own navigation lands: Back to it afterwards ends the search.
  // An ended search is dropped, not kept aside: Forward back to its URL would otherwise revive it.
  if (search !== null && urlId !== search.from && urlId !== search.to) setSearch(null);
  else if (search !== null && urlId === search.to && search.from !== search.to) setSearch({ ...search, from: search.to });
  const current = search !== null && (urlId === search.from || urlId === search.to) ? search : null;
  const active = current?.text ?? null;

  useEffect(() => {
    if (search === null) clearTimeout(timer.current);
  }, [search]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const settle = useCallback(() => {
    setSearch(null);
  }, []);

  const change = useCallback(
    (text: string) => {
      const id = parseDisputeId(text);
      if (text !== "" && id === null) return;
      if (active !== null && targetOf(active) === targetOf(text)) return;
      clearTimeout(timer.current);
      // Until the active search's navigation lands, `urlId` is the URL being left; the URL ends on that search's target.
      const landing = current === null ? urlId : current.to;
      const navigated = current?.navigated ?? false;
      if (landing === urlId && targetOf(text) === urlTarget(urlId)) {
        setSearch(null);
        return;
      }
      if (id === null) {
        setSearch({ text, from: urlId, to: landing, navigated });
        return;
      }
      setSearch({ text, from: urlId, to: id.toString(), navigated: true });
      void navigate(paths.case(chainId, id), { replace: navigated });
      timer.current = setTimeout(settle, SEARCH_DEBOUNCE_MS);
    },
    [active, chainId, current, navigate, settle, urlId],
  );

  const submit = useCallback(() => {
    if (active !== null && active !== "") settle();
  }, [active, settle]);

  const shown = active ?? urlId;
  return { pending: active, shownId: shown === undefined ? null : parseDisputeId(shown), change, submit };
}
