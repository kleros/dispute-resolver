import { useState } from "react";
import { Button } from "@kleros/ui-components-library";
import { useIsContractAccount } from "../data";
import { ExternalLink } from "../safe-content";
import { Notice } from "../ui";
import { dismissWarning, isWarningShown } from "./dismissal";
import type { SmartContractWalletWarningProps } from "./types";
import { useWallet } from "./useWallet";

const LEARN_MORE_URL = "https://docs.kleros.io/welcome/faq#can-i-use-a-smart-contract-account-to-stake-in-the-court";

/**
 * Code other than an EIP-7702 delegation marks a smart-contract wallet. An RPC error, a missing account or a chain
 * without RPC counts as "not a smart-contract wallet", so a failed read never warns.
 */
export function SmartContractWalletWarning({ chainId }: SmartContractWalletWarningProps) {
  const wallet = useWallet();
  const address = wallet.status === "connected" ? wallet.address : undefined;
  const isContract = useIsContractAccount(chainId, address);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());

  if (address === undefined || isContract.status !== "ready" || !isContract.value) return null;
  if (dismissed.has(address) || !isWarningShown(address)) return null;

  const dismiss = () => {
    dismissWarning(address);
    setDismissed((current) => new Set(current).add(address));
  };

  return (
    <section aria-label="Smart contract wallet warning" className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Notice variant="warning" title="Warning" body="You are using a smart contract wallet. This is not recommended." className="w-full" />
      <div className="flex shrink-0 items-center gap-4">
        <ExternalLink href={LEARN_MORE_URL}>Learn more</ExternalLink>
        <Button text="Dismiss" variant="secondary" small onPress={dismiss} aria-label="Dismiss the smart contract wallet warning" />
      </div>
    </section>
  );
}
