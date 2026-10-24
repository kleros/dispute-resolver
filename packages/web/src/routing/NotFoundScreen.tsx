import type { ChainId } from "@dispute-resolver/core";
import { useId } from "react";
import { Link } from "react-router";
import { ACTION_LINK_CLASS } from "../ui";
import acropolisUrl from "./acropolis.svg";
import { paths } from "./paths";

export interface NotFoundScreenProps {
  /** The resolved chain: the screen also renders outside the chain layout (`//foo`), where no page chain exists. */
  readonly chainId: ChainId;
}

/** The 404 screen: the Acropolis illustration, "404", "Page not found" and a link to the chain's Ongoing Disputes. */
export function NotFoundScreen({ chainId }: NotFoundScreenProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex w-full flex-col items-center gap-6 pb-16">
      <img src={acropolisUrl} alt="" width={2238} height={415} className="h-40 w-full rounded-[18px] object-cover object-center sm:h-auto" />
      <div className="flex flex-col items-center gap-3 px-4 text-center">
        <h1 id={headingId} className="text-4xl font-bold text-klerosUIComponentsPrimaryText sm:text-5xl">
          404
        </h1>
        <p className="text-xl font-semibold text-klerosUIComponentsPrimaryText">Page not found</p>
        <p className="text-base text-klerosUIComponentsSecondaryText">Something went wrong in Athens!</p>
      </div>
      <Link to={paths.ongoing(chainId)} className={ACTION_LINK_CLASS}>
        View Ongoing Disputes
      </Link>
    </section>
  );
}
