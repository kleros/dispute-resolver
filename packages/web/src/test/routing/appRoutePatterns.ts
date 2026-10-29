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
