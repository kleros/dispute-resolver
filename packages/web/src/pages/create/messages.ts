import type { CreateFieldErrorCode } from "@dispute-resolver/core";
import type { UploadError } from "../../atlas";

type ErrorField = "courtId" | "votes" | "title" | "question" | "optionCount" | "optionTitle" | "party" | "primaryDocument";

const REQUIRED: Readonly<Record<ErrorField, string>> = {
  courtId: "Please select a court.",
  votes: "Please enter the number of votes.",
  title: "Please enter a title for the dispute, something that explains it in a nutshell.",
  question: "Please enter a question.",
  optionCount: "Please enter the number of options.",
  optionTitle: 'Please enter this ruling option, for example: "Yes".',
  party: "Please fill in both the alias and the address.",
  primaryDocument: "Please upload the document again.",
};

export function fieldErrorMessage(field: ErrorField, code: CreateFieldErrorCode): string {
  const messages: Readonly<Record<CreateFieldErrorCode, string>> = {
    required: REQUIRED[field],
    "not-an-integer": "Please enter a whole number.",
    "out-of-range": field === "optionCount" ? "Please choose between 2 and 32 options." : "Please enter at least 1.",
    "invalid-address": "This is not a valid address. Use all lowercase, all uppercase or the checksummed form.",
    "duplicate-address": "This address is already used by another party.",
    "alias-without-address": "Please enter this party's address.",
    "address-without-alias": "Please enter this party's alias.",
    "not-content-addressed": "The uploaded document did not come back as a content-addressed IPFS path. Please upload it again.",
  };
  return messages[code];
}

/** `sign-in-rejected` is deliberately neutral. */
export const UPLOAD_FAILURE_TITLES: Readonly<Record<UploadError, string>> = {
  "no-wallet": "Wallet required",
  "limits-unavailable": "Upload unavailable",
  "mime-not-allowed": "Upload refused",
  "too-large": "Upload refused",
  "sign-in-rejected": "Sign-in cancelled",
  "sign-in-failed": "Sign-in failed",
  "upload-failed": "Upload failed",
  "not-content-addressed": "Upload refused",
};
