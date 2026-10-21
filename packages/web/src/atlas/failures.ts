import { BaseError } from "viem";
import { formatSize } from "./limits";
import type { RoleLimits, UploadError, UploadResult } from "./types";

type Failure = Extract<UploadResult, { readonly ok: false }>;

/** A short reason for an error from the library or the wallet. */
export function reasonOf(error: unknown): string | null {
  if (error instanceof BaseError) return error.shortMessage;
  if (error instanceof Error && /\S/.test(error.message)) return error.message;
  return null;
}

function withReason(sentence: string, reason: string | null): string {
  return reason === null ? sentence : `${sentence} (${reason})`;
}

export const UNCONFIGURED_MESSAGE = "Uploads are unavailable.";

/** Each refusal as shown to the user. Copy is free (ledger preamble); the error codes are the contract. */
export const failure = {
  unconfigured: (): Failure => ({ ok: false, error: "unconfigured", message: UNCONFIGURED_MESSAGE }),
  noWallet: (): Failure => ({ ok: false, error: "no-wallet", message: "Connect a wallet to upload files." }),
  limitsUnavailable: (): Failure => ({
    ok: false,
    error: "limits-unavailable",
    message: "The upload limits could not be loaded, so nothing was uploaded. Try again; if this keeps happening, reloading the page may help.",
  }),
  refused: (error: "mime-not-allowed" | "too-large", file: File, limits: RoleLimits): Failure =>
    error === "too-large"
      ? { ok: false, error, message: `The file is larger than the ${formatSize(limits.maxSize)} limit.` }
      : { ok: false, error, message: `Files of type "${file.type === "" ? "unknown" : file.type}" cannot be uploaded here.` },
  signInRejected: (): Failure => ({ ok: false, error: "sign-in-rejected", message: "Signature declined. Nothing was uploaded." }),
  signInFailed: (reason: string | null): Failure => ({ ok: false, error: "sign-in-failed", message: withReason("Sign-in failed. Please try again.", reason) }),
  uploadFailed: (reason: string | null): Failure => ({
    ok: false,
    error: "upload-failed",
    message: withReason("An error occurred while uploading the file. Please try again.", reason),
  }),
  notContentAddressed: (): Failure => ({
    ok: false,
    error: "not-content-addressed",
    message: "The upload service returned an address that is not content-addressed, so it was not used. Please try again.",
  }),
} as const satisfies Record<string, (...args: never[]) => Failure & { readonly error: UploadError }>;
