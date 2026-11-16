import { Button } from "@kleros/ui-components-library";
import { useId, useMemo, useState, type SyntheticEvent } from "react";
import { flushSync } from "react-dom";
import { CopyControl } from "../../ui";
import { plainAddress, plainHead, plainIsBlank, shortened } from "./plainAddress";

const TEXT_CLASS = "rounded-base text-sm text-klerosUIComponentsSecondaryText [overflow-wrap:anywhere]";
// Very long text scrolls inside the row, so the page around it stays usable.
const WHOLE_CLASS = `${TEXT_CLASS} max-h-64 overflow-y-auto border border-klerosUIComponentsStroke p-2`;

function onCopyButton(event: SyntheticEvent): boolean {
  return event.target instanceof Element && event.target.closest("button") !== null;
}

/**
 * What was submitted in place of an IPFS file, as plain text: never a link, never fetched. Past 200 characters it is cut
 * until Show all; the copy control always copies all of it. The cut view reads only the start of the value; all of it is
 * made plain only for Show all or once the copy control is reached.
 */
export function SubmittedText({ address }: { readonly address: string }) {
  const start = useMemo(() => plainAddress(plainHead(address)), [address]);
  const short = useMemo(() => shortened(start), [start]);
  const blank = useMemo(() => plainIsBlank(address), [address]);
  const [whole, setWhole] = useState(false);
  // Set by Show all or by reaching the copy control, and kept, so all of the value is made plain once.
  const [wanted, setWanted] = useState(false);
  const text = useMemo(() => {
    if (short === null) return start;
    return wanted ? plainAddress(address) : null;
  }, [address, short, start, wanted]);
  const boxId = useId();
  if (blank) return null;
  const expanded = whole && short !== null;
  // A click with no press or focus before it (a screen reader's) copies within that same event, so the whole text is
  // rendered into the copy control before the event reaches it.
  const reachCopy = (event: SyntheticEvent): void => {
    if (wanted || !onCopyButton(event)) return;
    flushSync(() => {
      setWanted(true);
    });
  };
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <CopyControl label="Copy the submitted text" content={text ?? start} layout="flex min-w-0 max-w-full" copiableClassName="min-w-0 items-start" onReach={reachCopy}>
        {/* A box that scrolls must take focus so a keyboard can scroll it. */}
        <div id={boxId} tabIndex={expanded ? 0 : undefined} className={expanded ? WHOLE_CLASS : TEXT_CLASS}>
          {expanded ? text : (short ?? start)}
        </div>
      </CopyControl>
      {short === null ? null : (
        <Button
          text={whole ? "Show less" : "Show all"}
          variant="secondary"
          small
          aria-expanded={whole}
          aria-controls={boxId}
          onPress={() => {
            setWhole((value) => !value);
            setWanted(true);
          }}
        />
      )}
    </div>
  );
}
