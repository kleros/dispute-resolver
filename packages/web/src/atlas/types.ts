import type { ReactNode } from "react";
import type { CanonicalIpfsPath, CreatedMetaEvidence, EvidenceDocument } from "@dispute-resolver/core";
import type { AppConfig } from "../env";

/** The two `CourtV1` roles the resolver uploads with: user files under `evidence`, generated JSON under `policy`. */
export type UploadRole = "evidence" | "policy";

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
  | "no-wallet"
  | "limits-unavailable" // the role restrictions could not be read; nothing is uploaded without them
  | "mime-not-allowed"
  | "too-large"
  | "sign-in-rejected"
  | "sign-in-failed"
  | "upload-failed"
  | "not-content-addressed"; // the returned path failed core's canonical check

export type UploadResult = { readonly ok: true; readonly path: CanonicalIpfsPath } | { readonly ok: false; readonly error: UploadError; readonly message: string };

export type JsonUpload = CreatedMetaEvidence | EvidenceDocument;

/** Signs in when needed, then uploads, in one user action. */
export interface AtlasUploader {
  readonly availability: AtlasAvailability;
  readonly phase: UploadPhase;
  /** The library's session is verified and the token carries a future `exp`. */
  readonly isSignedIn: boolean;
  limits(role: UploadRole): RoleLimits | null;
  upload(file: File, role: UploadRole): Promise<UploadResult>;
  uploadJson(fileName: string, value: JsonUpload, role: UploadRole): Promise<UploadResult>;
}

export interface UploadedFile {
  readonly path: CanonicalIpfsPath;
  readonly fileName: string;
}

export interface AtlasFileFieldProps {
  readonly role: UploadRole;
  /** Controlled, so a form can reset it. */
  readonly value: UploadedFile | null;
  readonly onUploaded: (file: UploadedFile) => void;
  readonly onCleared: () => void;
  readonly label?: string;
  /** Locks the field; without a connected wallet the field says that uploading needs one. */
  readonly isDisabled?: boolean;
  /**
   * Why the form locks the field, such as a wallet on another chain than the page's. While the field is locked it replaces
   * the drop prompt, which would otherwise invite a file the field cannot take.
   */
  readonly lockedReason?: string;
}

export interface AtlasGateProps {
  readonly config: AppConfig;
  readonly children?: ReactNode;
}
