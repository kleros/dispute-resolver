import { describeError } from "@dispute-resolver/core";
import { BaseError } from "viem";
import { limitsChoice } from "./limits";
import type { RoleLimits, UploadError, UploadFailure } from "./types";

/** A short reason for an error from the library or the wallet; a viem error is worded by core. */
export function reasonOf(error: unknown): string | null {
  if (error instanceof BaseError) return describeError(error);
  if (error instanceof Error && /\S/.test(error.message)) return error.message;
  return null;
}

function withReason(sentence: string, reason: string | null): string {
  return reason === null ? sentence : `${sentence} (${reason})`;
}

const REFUSAL_LEADS: Readonly<Record<"mime-not-allowed" | "too-large", string>> = {
  "mime-not-allowed": "This file type can't be uploaded.",
  "too-large": "This file is too large.",
};

/** The error codes are the stable contract; the copy may change. */
export const failure = {
  noWallet: (): UploadFailure => ({ ok: false, error: "no-wallet", message: "Connect a wallet to upload files." }),
  limitsUnavailable: (): UploadFailure => ({
    ok: false,
    error: "limits-unavailable",
    message: "The upload limits could not be loaded, so nothing was uploaded. Try again; if this keeps happening, reloading the page may help.",
  }),
  refused: (error: "mime-not-allowed" | "too-large", limits: RoleLimits): UploadFailure => ({
    ok: false,
    error,
    message: `${REFUSAL_LEADS[error]} ${limitsChoice(limits)}`,
  }),
  signInRejected: (): UploadFailure => ({ ok: false, error: "sign-in-rejected", message: "Signature declined. Nothing was uploaded." }),
  signInFailed: (reason: string | null): UploadFailure => ({ ok: false, error: "sign-in-failed", message: withReason("Sign-in failed. Please try again.", reason) }),
  uploadFailed: (reason: string | null): UploadFailure => ({
    ok: false,
    error: "upload-failed",
    message: withReason("An error occurred while uploading the file. Please try again.", reason),
  }),
  notContentAddressed: (): UploadFailure => ({
    ok: false,
    error: "not-content-addressed",
    message: "The upload service returned an address that is not content-addressed, so it was not used. Please try again.",
  }),
} as const satisfies Record<string, (...args: never[]) => UploadFailure & { readonly error: UploadError }>;
