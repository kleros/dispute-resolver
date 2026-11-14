import logoUrl from "./dispute-resolver-logo.svg";

/** The Kleros Dispute Resolver logo; its alternative text is the product name, so a link around it is named by it. */
export function BrandLogo() {
  return <img src={logoUrl} alt="Kleros Dispute Resolver" width={3033} height={772} className="h-8 w-auto lg:h-9" />;
}
