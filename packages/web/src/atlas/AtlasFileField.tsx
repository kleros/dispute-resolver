import { Button, FileUploader } from "@kleros/ui-components-library";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useConnectWallet, useWallet } from "../wallet";
import { useAtlasUpload } from "./context";
import { UNCONFIGURED_MESSAGE, failure, reasonOf } from "./failures";
import { formatSize } from "./limits";
import type { AtlasFileFieldProps, RoleLimits, UploadPhase, UploadResult, UploadedFile } from "./types";

type Failure = Extract<UploadResult, { readonly ok: false }>;

interface StatusLine {
  readonly msg: string;
  readonly variant?: "success" | "warning" | "error" | "info";
}

interface FieldState {
  readonly unavailable: boolean;
  readonly pending: File | null;
  readonly phase: UploadPhase;
  readonly failed: Failure | null;
  readonly value: UploadedFile | null;
  readonly limits: RoleLimits | null;
}

const SELECT_PROMPT = "Drop a file here or click to select one.";

/** The one message line under the dropzone: availability, progress (D-08), the outcome, or the server's size limit (D-42). */
function statusLine({ unavailable, pending, phase, failed, value, limits }: FieldState): StatusLine {
  if (unavailable) return { msg: UNCONFIGURED_MESSAGE, variant: "warning" };
  if (pending !== null) {
    return phase === "signing-in" ? { msg: "Sign the message in your wallet to start the upload.", variant: "info" } : { msg: "Uploading to IPFS...", variant: "info" };
  }
  if (failed !== null) return { msg: failed.message, variant: failed.error === "sign-in-rejected" ? "warning" : "error" };
  if (value !== null) return { msg: `Uploaded ${value.fileName}.`, variant: "success" };
  if (limits === null) return { msg: SELECT_PROMPT };
  return { msg: `${SELECT_PROMPT} Maximum size: ${formatSize(limits.maxSize)}.` };
}

/**
 * The upload dropzone of Create and of the evidence modal (ARCHITECTURE.md §8.3). Choosing a file signs in when needed
 * and uploads it in one action (D-52); the field shows the server's limit (D-42), the progress and the chosen file's name
 * (D-08), and every failure. `value` is controlled so a form can reset it (D-44). The file itself is never rendered (A17).
 */
export function AtlasFileField({ role, value, onUploaded, onCleared, label = "File", isDisabled = false }: AtlasFileFieldProps) {
  const uploader = useAtlasUpload();
  const wallet = useWallet();
  const connect = useConnectWallet();
  const labelId = useId();
  const [pending, setPending] = useState<File | null>(null);
  const [failed, setFailed] = useState<Failure | null>(null);
  // Remounting the library's dropzone is the only way to clear the file name it keeps after a failed or reset upload.
  const [failures, setFailures] = useState(0);
  const uploadedFile = useMemo(() => (value === null ? undefined : new File([], value.fileName)), [value]);
  const fieldRef = useRef<HTMLDivElement>(null);
  const valuePath = value?.path;

  // The library's visible file-picker button has no name of its own (its dropzone points at a missing "dropzone-label"),
  // so the field's own label names it, after every mount and remount of the dropzone (the `key` below).
  useEffect(() => {
    fieldRef.current?.querySelector("button[data-rac]:not([aria-label])")?.setAttribute("aria-labelledby", labelId);
  }, [failures, valuePath, labelId]);

  const unavailable = uploader.availability === "unconfigured";
  const limits = uploader.limits(role);
  const status = statusLine({ unavailable, pending, phase: uploader.phase, failed, value, limits });

  const isLocked = unavailable || isDisabled || pending !== null;

  const handleFile = async (file: File) => {
    // The library disables only its drop target; its file picker button stays usable, so a locked field ignores picks.
    if (isLocked) return;
    if (value !== null) onCleared();
    setFailed(null);
    setPending(file);
    let result: UploadResult;
    try {
      result = await uploader.upload(file, role);
    } catch (error) {
      result = failure.uploadFailed(reasonOf(error));
    }
    setPending(null);
    if (result.ok) {
      onUploaded({ path: result.path, fileName: file.name });
    } else {
      setFailed(result);
      setFailures((count) => count + 1);
    }
  };

  const offerConnect = failed?.error === "no-wallet" && wallet.status !== "connected" && connect.available;
  const offerRemove = value !== null && pending === null && !isDisabled;

  return (
    <div role="group" aria-labelledby={labelId} className="flex w-full min-w-0 flex-col gap-2">
      <span id={labelId} className="text-sm text-klerosUIComponentsSecondaryText">
        {label}
      </span>
      {/* While a file is over the dropzone (react-aria's `data-drop-target`) its dashed edge turns solid on a white fill. */}
      <div ref={fieldRef} aria-live="polite" className="w-full min-w-0 [&_[data-drop-target]]:border-solid [&_[data-drop-target]]:bg-klerosUIComponentsWhiteBackground">
        <FileUploader
          key={`${String(failures)}:${value?.path ?? ""}`}
          className="w-full [overflow-wrap:anywhere]"
          callback={(file) => {
            void handleFile(file);
          }}
          msg={status.msg}
          variant={status.variant}
          // The dropzone's own type filter matches exact types only and would silently refuse drops for `type/*` entries,
          // so the server's list goes to the file picker alone; `upload` applies the library's rule to every file (B16).
          fileTriggerProps={limits === null ? undefined : { acceptedFileTypes: [...limits.allowedMimeTypes] }}
          isDisabled={isLocked}
          selectedFile={pending ?? uploadedFile}
        />
      </div>
      {offerConnect || offerRemove ? (
        <div className="flex flex-wrap gap-2">
          {offerConnect ? (
            <Button
              text="Connect wallet"
              small
              onPress={() => {
                connect.open();
              }}
            />
          ) : null}
          {offerRemove ? <Button text="Remove file" variant="secondary" small onPress={onCleared} /> : null}
        </div>
      ) : null}
    </div>
  );
}
