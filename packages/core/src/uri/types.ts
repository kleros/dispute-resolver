/** Produced only by `normalizeIpfsPath`; segments are percent-encoded once, so `gatewayUrl` appends it as is. */
export type CanonicalIpfsPath = `/ipfs/${string}`;

/**
 * A canonical path without the `/ipfs/` prefix: the form of dynamic-script allowlist entries. It starts with the CID, so
 * it starts with `Qm` (CIDv0) or `b` (base32 CIDv1); a listed entry that does not fails to compile.
 */
export type CidPath = `${"Qm" | "b"}${string}`;

/** Never ends with a slash: canonical paths are appended to it as they are. */
export type GatewayOrigin = `https://${string}`;

export type AttachmentKind = "image" | "video" | "text" | "other";

/**
 * An untrusted attachment or document reference made safe to show. A `link` is always an absolute https URL (the
 * gateway URL for IPFS paths and for `http(s)://<host>/ipfs/<CID>` URLs); anything else that is non-empty is shown as
 * plain `text`.
 */
export type AttachmentLink =
  { readonly kind: "link"; readonly href: string; readonly label: string; readonly attachmentKind: AttachmentKind } | { readonly kind: "text"; readonly text: string };

/** Hosts that count as "this app" for the self-link rule: the running app's host plus the registry's canonical hosts. */
export interface SelfHosts {
  readonly appHost: string;
  readonly canonicalHosts: readonly string[];
}
