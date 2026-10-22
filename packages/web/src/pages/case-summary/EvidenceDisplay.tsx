import type { ChainId, MetaEvidence } from "@dispute-resolver/core";
import { Button } from "@kleros/ui-components-library";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { APP_CONFIG } from "../../env";
import { buildEvidenceDisplay, EvidenceDisplayFrame } from "../../safe-content";
import { useCoreDeps } from "../../data";
import { LABEL } from "../../ui";
import type { FoundLookup } from "./caseState";

interface EvidenceDisplayProps {
  readonly metaEvidence: MetaEvidence;
  /** The page chain, the arbitrator's chain. */
  readonly chainId: ChainId;
  readonly found: FoundLookup;
}

/**
 * A live region announces only what changes after it is in the tree, so it mounts empty and is filled this much later:
 * the delay react-aria's own announcer leaves between creating its region and writing into it.
 */
const STATUS_DELAY_MS = 100;

/**
 * Whether keyboard focus is inside the window's frame. An iframe never matches :focus while its page holds focus and
 * fires no focus event in this document, so keyboard focus is found as this document's active element after each Tab;
 * any focus that comes back to this document clears it. A pointer click into the page is not keyboard focus and leaves
 * it false. Only this document's active element is read, never the frame's source or window.
 */
function useKeyboardFocusInside(windowRef: RefObject<HTMLElement | null>): boolean {
  const [inside, setInside] = useState(false);
  useEffect(() => {
    let pending: number | undefined;
    const check = () => {
      const active = document.activeElement;
      setInside(active instanceof HTMLIFrameElement && windowRef.current?.contains(active) === true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      window.clearTimeout(pending);
      pending = window.setTimeout(check, 0);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearTimeout(pending);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", check);
      window.removeEventListener("focus", check);
    };
  }, [windowRef]);
  return inside;
}

/**
 * The meta-evidence's evidence-display iframe, or nothing when it names no https display. The arbitrable and the
 * arbitrator come from the arbitrator's binding, never from meta-evidence.
 *
 * The window shows the top 256 px of the 360 px frame until "Show full frame"; only the window's height changes, so the
 * page never reloads. While keyboard focus is inside the frame, index.css opens the window to the full frame, so a
 * focused link of the page is never hidden below the cut. Until the frame loads, its paper marks where the page will be.
 * `min-w-42` gives both labels of the control the same width, so swapping them never re-wraps the label row and moves
 * the frame.
 */
export function EvidenceDisplay({ metaEvidence, chainId, found }: EvidenceDisplayProps) {
  const { env, gateway } = useCoreDeps();
  const windowId = useId();
  const labelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);
  const focusInside = useKeyboardFocusInside(windowRef);
  const [status, setStatus] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => {
      setStatus("Loading…");
    }, STATUS_DELAY_MS);
    return () => {
      window.clearTimeout(id);
    };
  }, []);
  const { binding } = found;
  const model = buildEvidenceDisplay({
    metaEvidence,
    arbitratorChainId: chainId,
    disputeId: binding.disputeId,
    arbitrable: binding.arbitrated,
    arbitrator: binding.arbitrator,
    env,
    gateway,
    appOrigin: APP_CONFIG.appOrigin,
  });
  if (model === null) return null;
  return (
    <div className="flex flex-col gap-3 border-t border-klerosUIComponentsStroke pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p id={labelId} className={`${LABEL} min-w-0`}>
          {/* The space stays outside the hidden dot, so screen readers do not run the title into the subtitle. */}
          Evidence display{" "}
          <span aria-hidden="true" className="max-sm:hidden">
            {"· "}
          </span>
          <span className="max-sm:sr-only">Shown by the arbitrable application</span>
        </p>
        <Button
          variant="secondary"
          small
          className="ml-auto min-w-42 shrink-0"
          text={expanded ? "Show less" : "Show full frame"}
          aria-expanded={expanded}
          aria-controls={windowId}
          aria-describedby={labelId}
          onPress={() => {
            setExpanded((value) => !value);
          }}
        />
      </div>
      {loaded ? null : (
        <output aria-live="polite" className="sr-only">
          {status}
        </output>
      )}
      <div className="border-b border-klerosUIComponentsStroke">
        <div
          id={windowId}
          ref={windowRef}
          data-frame-focus={focusInside ? "" : undefined}
          aria-busy={loaded ? undefined : true}
          className={`dr-display-window overflow-clip rounded-base transition-[height] duration-(--resize-dur) ease-(--resize-ease) motion-reduce:transition-none ${expanded ? "h-[360px]" : "h-[256px]"}`}
        >
          <EvidenceDisplayFrame
            model={model}
            onLoad={() => {
              setLoaded(true);
            }}
          />
        </div>
      </div>
    </div>
  );
}
