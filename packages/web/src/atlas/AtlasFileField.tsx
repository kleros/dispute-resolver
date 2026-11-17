import { Button, FileUploader } from "@kleros/ui-components-library";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useConnectWallet, useWallet } from "../wallet";
import { useAtlasUpload } from "./context";
import { failure, reasonOf } from "./failures";
import { limitsHint } from "./limits";
import type { AtlasFileFieldProps, RoleLimits, UploadFailure, UploadPhase, UploadResult, UploadedFile } from "./types";

interface StatusLine {
  readonly msg?: string;
  readonly variant?: "success" | "warning" | "error" | "info";
}

interface FieldState {
  readonly unavailable: boolean;
  readonly lockedReason: string | null;
  readonly pending: File | null;
  readonly phase: UploadPhase;
  readonly failed: UploadFailure | null;
  readonly value: UploadedFile | null;
  readonly limits: RoleLimits | null;
  readonly signInHint: boolean;
}

const SELECT_PROMPT = "Drop a file here or click to select one.";
const SIGN_IN_HINT = "Your wallet will ask you to sign in before the first upload.";

const DROPZONE = "w-full [overflow-wrap:anywhere]";
// The dropzone remounts on every failure, so a refused file replays the shake; a network or sign-in failure does not shake.
const REFUSED_DROPZONE = `${DROPZONE} animate-[t-input-shake_calc(var(--shake-dur-a)*2+var(--shake-dur-b)*2)_linear] motion-reduce:animate-none`;

function isRefusal(failed: UploadFailure | null): boolean {
  return failed?.error === "too-large" || failed?.error === "mime-not-allowed";
}

/**
 * The library marks only its dropzone `data-disabled` and keeps the enabled blue edge, fill and icon on it, so a locked
 * field would still look like it takes a file. Its hover fill is `!important` in `@layer components`, which no utility
 * can outrank, so the locked zone takes no pointer events and the field around it carries the cursor.
 */
const LOCKED_LOOK =
  "[&_[data-disabled]]:border-klerosUIComponentsStroke [&_[data-disabled]]:bg-klerosUIComponentsLightGrey [&_[data-disabled]]:pointer-events-none [&:has([data-disabled])]:cursor-not-allowed [&_[data-disabled]~*]:cursor-auto [&_[data-disabled]_svg]:fill-klerosUIComponentsSecondaryText";

function statusLine({ unavailable, lockedReason, pending, phase, failed, value, limits, signInHint }: FieldState): StatusLine {
  if (unavailable) return {};
  if (lockedReason !== null && pending === null && failed === null && value === null) return { msg: lockedReason, variant: "info" };
  if (pending !== null) {
    return phase === "signing-in" ? { msg: "Sign the message in your wallet to start the upload.", variant: "info" } : { msg: "Uploading to IPFS...", variant: "info" };
  }
  if (failed !== null) return { msg: failed.message, variant: failed.error === "sign-in-rejected" ? "warning" : "error" };
  if (value !== null) return { msg: `Uploaded ${value.fileName}.`, variant: "success" };
  const invitation = limits === null ? SELECT_PROMPT : `${SELECT_PROMPT} ${limitsHint(limits)}`;
  return { msg: signInHint ? `${invitation} ${SIGN_IN_HINT}` : invitation };
}

function whyLocked(walletConnected: boolean, formReason: string | undefined): string | null {
  if (!walletConnected) return failure.noWallet().message;
  return formReason ?? null;
}

/** The file itself is never rendered: it is untrusted content. */
export function AtlasFileField({ role, value, onUploaded, onCleared, label = "File", isDisabled = false, lockedReason }: AtlasFileFieldProps) {
  const uploader = useAtlasUpload();
  const wallet = useWallet();
  const connect = useConnectWallet();
  const labelId = useId();
  const [pending, setPending] = useState<File | null>(null);
  const [failed, setFailed] = useState<UploadFailure | null>(null);
  // Remounting the library's dropzone is the only way to clear the file name it keeps after a failed or reset upload.
  const [failures, setFailures] = useState(0);
  const uploadedFile = useMemo(() => (value === null ? undefined : new File([], value.fileName)), [value]);
  const fieldRef = useRef<HTMLDivElement>(null);
  const valuePath = value?.path;

  const unavailable = uploader.availability === "unconfigured";
  const limits = uploader.limits(role);
  const status = statusLine({
    unavailable,
    lockedReason: isDisabled ? whyLocked(wallet.status === "connected", lockedReason) : null,
    pending,
    phase: uploader.phase,
    failed,
    value,
    limits,
    signInHint: uploader.availability === "ready" && !uploader.isSignedIn && !isDisabled,
  });

  const hasMessage = status.msg !== undefined;

  // The library gives its visible file-picker button no name and no description: its hidden drop target alone points at
  // the message line (the fixed id "dropzone-label"). The field's label names the button and the message describes it,
  // after every mount and remount of the dropzone (the `key` below) and whenever the message line comes or goes.
  useEffect(() => {
    const picker = fieldRef.current?.querySelector("button[data-rac]:not([aria-label])");
    if (!picker) return;
    picker.setAttribute("aria-labelledby", labelId);
    const message = fieldRef.current?.querySelector("small#dropzone-label");
    if (message) picker.setAttribute("aria-describedby", message.id);
    else picker.removeAttribute("aria-describedby");
  }, [failures, valuePath, labelId, hasMessage]);

  const isLocked = unavailable || isDisabled || pending !== null;

  const handleFile = async (file: File) => {
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
  const offerRemove = value !== null && pending === null && !isDisabled && !unavailable;

  return (
    <fieldset aria-labelledby={labelId} className="m-0 flex w-full min-w-0 flex-col gap-2 border-0 p-0">
      <span id={labelId} className="text-sm text-klerosUIComponentsSecondaryText">
        {label}
      </span>
      {/* While a file is over the dropzone (react-aria's `data-drop-target`) its dashed edge turns solid on a white fill. */}
      <div
        ref={fieldRef}
        aria-live="polite"
        className={`w-full min-w-0 [&_[data-drop-target]]:border-solid [&_[data-drop-target]]:bg-klerosUIComponentsWhiteBackground ${LOCKED_LOOK}`}
      >
        {/* The library disables only its drop target; the disabled fieldset also disables its file-picker button and input. */}
        <fieldset disabled={isLocked} className="m-0 min-w-0 border-0 p-0">
          <FileUploader
            key={`${String(failures)}:${value?.path ?? ""}`}
            className={isRefusal(failed) ? REFUSED_DROPZONE : DROPZONE}
            callback={(file) => {
              void handleFile(file);
            }}
            msg={status.msg}
            variant={status.variant}
            // The dropzone's own type filter matches exact types only and would silently refuse drops for `type/*` entries,
            // so the server's list goes to the file picker alone; `upload` applies the library's rule to every file.
            fileTriggerProps={limits === null ? undefined : { acceptedFileTypes: [...limits.allowedMimeTypes] }}
            isDisabled={isLocked}
            selectedFile={pending ?? uploadedFile}
          />
        </fieldset>
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
    </fieldset>
  );
}
