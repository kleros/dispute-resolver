import type { ReactNode } from "react";
import type { CanonicalIpfsPath, CreatedMetaEvidence, EvidenceDocument } from "@dispute-resolver/core";
import type { AppConfig } from "../env";

/** The two `CourtV1` roles the resolver uploads with (A16): user files under `evidence`, generated JSON under `policy`. */
export type UploadRole = "evidence" | "policy";

/** A role's server-provided restrictions (D-42, B16). */
export interface RoleLimits {
  /** Bytes. */
  readonly maxSize: number;
  /** Exact types or `type/*` prefixes. */
  readonly allowedMimeTypes: readonly string[];
}

export type AtlasAvailability = "unconfigured" | "ready";

export type UploadPhase = "idle" | "signing-in" | "uploading";

/** Why an upload did not produce a path. `sign-in-rejected` is the user's choice, shown neutrally. */
export type UploadError =
  | "unconfigured" // REACT_APP_ATLAS_URI unset (D-21)
  | "no-wallet"
  | "limits-unavailable" // the role restrictions could not be read; nothing is uploaded without them
  | "mime-not-allowed"
  | "too-large"
  | "sign-in-rejected"
  | "sign-in-failed"
  | "upload-failed"
  | "not-content-addressed"; // the returned path failed core's canonical check (B16)

export type UploadResult = { readonly ok: true; readonly path: CanonicalIpfsPath } | { readonly ok: false; readonly error: UploadError; readonly message: string };

/** The JSON documents the app uploads with role `policy` (spec 4.5, 5.14). */
export type JsonUpload = CreatedMetaEvidence | EvidenceDocument;

/** `useAtlasUpload()` (ARCHITECTURE.md §8.2): sign in when needed, then upload, in one user action (D-52). */
export interface AtlasUploader {
  readonly availability: AtlasAvailability;
  readonly phase: UploadPhase;
  /** The library's session is verified and the token carries a future `exp` (B16). */
  readonly isSignedIn: boolean;
  limits(role: UploadRole): RoleLimits | null;
  upload(file: File, role: UploadRole): Promise<UploadResult>;
  uploadJson(fileName: string, value: JsonUpload, role: UploadRole): Promise<UploadResult>;
}

/** The file currently attached to a form. */
export interface UploadedFile {
  readonly path: CanonicalIpfsPath;
  readonly fileName: string;
}

/** The upload dropzone of Create and of the evidence modal (ARCHITECTURE.md §8.3). */
export interface AtlasFileFieldProps {
  readonly role: UploadRole;
  /** Controlled, so a form can reset it (D-44). */
  readonly value: UploadedFile | null;
  readonly onUploaded: (file: UploadedFile) => void;
  readonly onCleared: () => void;
  readonly label?: string;
  readonly isDisabled?: boolean;
}

/** `AtlasGate` (ARCHITECTURE.md §8.1): the library's provider when `config.atlasUri` is set, the unconfigured uploader otherwise. */
export interface AtlasGateProps {
  readonly config: AppConfig;
  readonly children?: ReactNode;
}
