/** The only RPC URLs a script is given or redirected to are absolute `https:` URLs. */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
