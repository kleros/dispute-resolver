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
 * Every change replaces the URL at once, built only from the parsed ID; only the load of that ID waits for the debounce
 * or for Enter. An empty field shows no dispute and leaves the URL as it is. A change of the URL the search did not make
 * (back, a header link) ends the pending search.
 */
export function useDisputeSearch(chainId: ChainId, urlId: string | undefined): DisputeSearch {
  const navigate = useNavigate();
  const [search, setSearch] = useState<Search | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = search !== null && (urlId === search.from || urlId === search.to) ? search.text : null;

  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const settle = useCallback(() => {
    clearTimeout(timer.current);
    setSearch(null);
  }, []);

  const change = useCallback(
    (text: string) => {
      const id = parseDisputeId(text);
      if (text !== "" && id === null) return;
      if (active !== null && targetOf(active) === targetOf(text)) return;
      clearTimeout(timer.current);
      // Until the active search's navigation lands, `urlId` is the URL being left; the URL ends on that search's target.
      const landing = active === null ? urlId : search?.to;
      if (landing === urlId && targetOf(text) === urlTarget(urlId)) {
        setSearch(null);
        return;
      }
      if (id === null) {
        setSearch({ text, from: urlId, to: landing });
        return;
      }
      setSearch({ text, from: urlId, to: id.toString() });
      void navigate(paths.case(chainId, id), { replace: true });
      timer.current = setTimeout(settle, SEARCH_DEBOUNCE_MS);
    },
    [active, chainId, navigate, search, settle, urlId],
  );

  const submit = useCallback(() => {
    if (active !== null && active !== "") settle();
  }, [active, settle]);

  const shown = active ?? urlId;
  return { pending: active, shownId: shown === undefined ? null : parseDisputeId(shown), change, submit };
}
