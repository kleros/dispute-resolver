/** Whether `value` is an absolute `https:` URL (B5: the only RPC URLs a script is given or redirected to). */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
