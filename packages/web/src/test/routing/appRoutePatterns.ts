/**
 * The app route patterns, in Netlify's syntax: the route table's coverage test checks the app serves each one, and
 * the headers test checks `public/_headers` gives each one the app's policy.
 */
export const APP_ROUTE_PATTERNS = [
  "/",
  "/index.html",
  "/:chain",
  "/:chain/ongoing",
  "/:chain/create",
  "/:chain/cases",
  "/:chain/cases/*",
  "/:chain/interact/*",
  "/:chain/disputes",
] as const;
