import { Notice } from "../../ui";

const BODY =
  "The arbitrable contract of this dispute is not compatible with the interface of Dispute Resolver. You can't submit evidence or fund appeals on this interface. You can do these on the arbitrable application, if implemented.";

/**
 * The "View mode only" banner of a view-only dispute (spec 5.5). Today's "Non-Standard Contract"
 * variant is not built: nothing produces that category (spec 10.10, D-11).
 */
export function CompatibilityBanner() {
  return <Notice variant="info" title="View mode only for this dispute" body={BODY} />;
}
