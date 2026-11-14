import { Notice } from "../../ui";
import type { CaseSectionProps } from "../../data";

const TITLE = "Details from the arbitrable's script are unavailable";
const BODY =
  "This dispute's arbitrable adds details through a script, which could not be used. The page shows the details recorded in the dispute's meta-evidence, so some of them may be incomplete.";

/**
 * The static meta-evidence may be a placeholder the script would have filled in, such as a generic title or no ruling
 * options, and nothing tells which fields the script would have changed, so one notice qualifies the whole page.
 */
export function ScriptDetailsNotice({ dispute }: CaseSectionProps) {
  const { metaEvidence } = dispute;
  if (metaEvidence.status !== "ready" || metaEvidence.value.status !== "ok") return null;
  const { script } = metaEvidence.value;
  const skipped = !script.ran && (script.reason === "script-chain-unavailable" || script.reason === "script-fetch-failed");
  return skipped ? <Notice variant="info" title={TITLE} body={BODY} /> : null;
}
