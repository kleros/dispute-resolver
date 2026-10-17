/**
 * A content-addressed IPFS path in canonical form: `/ipfs/<CID>` optionally followed by `/<segment>...`, produced only by
 * `normalizeIpfsPath` after percent-decoding and dot-segment resolution (B2, B18, D-24). The CID is a CIDv0
 * (`Qm` + 44 base58 characters) or a base32 CIDv1 (`b` + at least 50 of `[a-z2-7]`). Each segment is stored
 * percent-encoded once (`encodeURIComponent` of the decoded segment), so the path is a fixed point of
 * `normalizeIpfsPath`, `gatewayUrl` appends it as is, and it can be written or concatenated without re-encoding.
 */
export type CanonicalIpfsPath = `/ipfs/${string}`;

/**
 * A canonical path without the `/ipfs/` prefix: the form of dynamic-script allowlist entries (06 §3 invariant 4). It
 * starts with the CID, so it starts with `Qm` (CIDv0) or `b` (base32 CIDv1); a listed entry that does not fails to compile.
 */
export type CidPath = `${"Qm" | "b"}${string}`;

/** The configured IPFS gateway origin, `https://...` without a trailing slash (`REACT_APP_IPFS_GATEWAY`, default `https://cdn.kleros.link`). */
export type GatewayOrigin = `https://${string}`;

/** Icon class of an attachment, chosen from the extension of its last path segment (A17). */
export type AttachmentKind = "image" | "video" | "text" | "other";

/**
 * An untrusted attachment or document reference made safe to show (A10, B19, D-32). A `link` is always an absolute
 * https URL (gateway URL for IPFS paths); anything else that is non-empty is shown as plain `text`.
 */
export type AttachmentLink =
  { readonly kind: "link"; readonly href: string; readonly label: string; readonly attachmentKind: AttachmentKind } | { readonly kind: "text"; readonly text: string };

/** Hosts that count as "this app" for the self-link rule (D-28): the running app's host plus the registry's canonical hosts. */
export interface SelfHosts {
  readonly appHost: string;
  readonly canonicalHosts: readonly string[];
}
