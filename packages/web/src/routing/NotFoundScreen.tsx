import { useId } from "react";
import acropolisUrl from "./acropolis.svg";

/**
 * The 404 screen (spec §2.6): the Acropolis illustration, "404" and "Something went wrong in Athens!". The route table
 * renders it inside the page frame, whose header links use the resolved chain (D-45).
 */
export function NotFoundScreen() {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex w-full flex-col items-center gap-6 pb-16">
      <img src={acropolisUrl} alt="" width={2238} height={415} className="h-40 w-full rounded-[18px] object-cover object-center sm:h-auto" />
      <div className="flex flex-col items-center gap-3 px-4 text-center">
        <h1 id={headingId} className="text-4xl font-bold text-klerosUIComponentsPrimaryText sm:text-5xl">
          404
        </h1>
        <p className="text-lg text-klerosUIComponentsSecondaryText">Something went wrong in Athens!</p>
      </div>
    </section>
  );
}
