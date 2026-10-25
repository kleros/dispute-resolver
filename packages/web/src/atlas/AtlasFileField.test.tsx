import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TEST_ROLE_LIMITS, TEST_UPLOAD_PATH, TestAtlasProvider, fakeUploader, testPdf, type FakeUploader } from "../test/atlas";
import { TestDataProvider } from "../test/data";
import { TestWalletProvider, createTestWallet, type TestWallet } from "../test/wallet";
import { AtlasFileField } from "./AtlasFileField";
import { failure } from "./failures";
import type { AtlasFileFieldProps, UploadResult, UploadedFile } from "./types";

const UPLOADED: UploadedFile = { path: TEST_UPLOAD_PATH, fileName: "brief.pdf" };

/** An upload the test settles by hand. */
function pendingUpload() {
  const control: { settle?: (result: UploadResult) => void } = {};
  const promise = new Promise<UploadResult>((resolve) => {
    control.settle = resolve;
  });
  return {
    promise,
    settle(result: UploadResult) {
      control.settle?.(result);
    },
  };
}

interface HarnessProps extends Partial<Omit<AtlasFileFieldProps, "value">> {
  readonly initial?: UploadedFile | null;
}

/** A form that owns the field's value, as Create and the evidence modal do, with a reset. */
function Harness({ initial = null, onUploaded, onCleared, ...props }: HarnessProps) {
  const [value, setValue] = useState<UploadedFile | null>(initial);
  return (
    <>
      <AtlasFileField
        role="evidence"
        label="Primary document"
        {...props}
        value={value}
        onUploaded={(file) => {
          onUploaded?.(file);
          setValue(file);
        }}
        onCleared={() => {
          onCleared?.();
          setValue(null);
        }}
      />
      <button
        type="button"
        onClick={() => {
          setValue(null);
        }}
      >
        Reset form
      </button>
    </>
  );
}

interface RenderOptions extends HarnessProps {
  readonly uploader?: FakeUploader;
  readonly wallet?: TestWallet;
  /** Connects the wallet before rendering; default `true`. */
  readonly connect?: boolean;
}

/** The classes that give the library's disabled dropzone a neutral look instead of its enabled blue one. */
const LOCKED_LOOK = [
  "[&_[data-disabled]]:border-klerosUIComponentsStroke",
  "[&_[data-disabled]]:bg-klerosUIComponentsLightGrey",
  "[&_[data-disabled]]:hover:bg-klerosUIComponentsLightGrey",
  "[&_[data-disabled]]:cursor-not-allowed",
  "[&_[data-disabled]_svg]:fill-klerosUIComponentsSecondaryText",
];

async function renderField({ uploader = fakeUploader(), wallet = createTestWallet(), connect = true, ...props }: RenderOptions = {}) {
  if (connect) await wallet.connect();
  const tree = (current: FakeUploader) => (
    <TestDataProvider>
      <TestWalletProvider wallet={wallet}>
        <TestAtlasProvider uploader={current}>
          <Harness {...props} />
        </TestAtlasProvider>
      </TestWalletProvider>
    </TestDataProvider>
  );
  const view = render(tree(uploader));
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("The field has no file input.");
  const rerenderWith = (next: FakeUploader) => {
    view.rerender(tree(next));
  };
  return { ...view, input, uploader, wallet, rerenderWith };
}

/** The library dropzone's root, the element that carries the field's className. */
function dropzone(container: HTMLElement): HTMLElement {
  const root = container.querySelector("fieldset fieldset > div");
  if (!(root instanceof HTMLElement)) throw new Error("The field has no dropzone.");
  return root;
}

const SHAKE = "animate-[t-input-shake_calc(var(--shake-dur-a)*2+var(--shake-dur-b)*2)_linear]";

function choose(input: HTMLInputElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

describe("AtlasFileField", () => {
  it("names the accepted formats and the size limit, and offers the role's types to the file picker", async () => {
    const { input, uploader } = await renderField();

    expect(screen.getByText("Drop a file here or click to select one. PDF, image or text, up to 20 MB.")).toBeInTheDocument();
    expect(uploader.limits).toHaveBeenCalledWith("evidence");
    expect(input).toHaveAttribute("accept", "application/pdf,image/*,text/plain");
  });

  it("still invites a file without known limits and lets the upload report why it cannot proceed", async () => {
    const upload = vi.fn(() => Promise.resolve(failure.limitsUnavailable()));
    const { input } = await renderField({ uploader: fakeUploader({ limits: () => null, upload }) });

    expect(screen.getByText("Drop a file here or click to select one.")).toBeInTheDocument();
    expect(input).not.toHaveAttribute("accept");
    choose(input, testPdf());

    expect(await screen.findByText(failure.limitsUnavailable().message)).toBeInTheDocument();
  });

  it("says the wallet asks for a sign-in before the first upload while not signed in", async () => {
    await renderField({ uploader: fakeUploader({ isSignedIn: false }) });

    expect(
      screen.getByText("Drop a file here or click to select one. PDF, image or text, up to 20 MB. Your wallet will ask you to sign in before the first upload."),
    ).toBeInTheDocument();
  });

  it("keeps the sign-in sentence when the limits are unknown", async () => {
    await renderField({ uploader: fakeUploader({ isSignedIn: false, limits: () => null }) });

    expect(screen.getByText("Drop a file here or click to select one. Your wallet will ask you to sign in before the first upload.")).toBeInTheDocument();
  });

  it("drops the sign-in sentence once signed in", async () => {
    const { rerenderWith } = await renderField({ uploader: fakeUploader({ isSignedIn: false }) });
    expect(screen.getByText(/Your wallet will ask you to sign in before the first upload\./)).toBeInTheDocument();

    rerenderWith(fakeUploader({ isSignedIn: true }));

    expect(screen.getByText("Drop a file here or click to select one. PDF, image or text, up to 20 MB.")).toBeInTheDocument();
    expect(screen.queryByText(/sign in/)).not.toBeInTheDocument();
  });

  it("says nothing about signing in while locked, while signing in or uploading, after a failure, or once a file is uploaded", async () => {
    const SIGN_IN = /sign in before the first upload/;
    for (const locked of [{ isDisabled: true }, { isDisabled: true, connect: false }, { isDisabled: true, lockedReason: "Switch your wallet to Ethereum to continue." }]) {
      const view = await renderField({ uploader: fakeUploader({ isSignedIn: false }), ...locked });
      expect(view.container).not.toHaveTextContent(SIGN_IN);
      view.unmount();
    }

    const signingIn = pendingUpload();
    const signing = await renderField({ uploader: fakeUploader({ phase: "signing-in", isSignedIn: false, upload: () => signingIn.promise }) });
    choose(signing.input, testPdf());
    await screen.findByText("Sign the message in your wallet to start the upload.");
    expect(signing.container).not.toHaveTextContent(SIGN_IN);
    signingIn.settle(failure.signInRejected());
    await screen.findByText(failure.signInRejected().message);
    expect(signing.container).not.toHaveTextContent(SIGN_IN);
    signing.unmount();

    const uploading = pendingUpload();
    const upload = await renderField({ uploader: fakeUploader({ phase: "uploading", isSignedIn: false, upload: () => uploading.promise }) });
    choose(upload.input, testPdf());
    await screen.findByText("Uploading to IPFS...");
    expect(upload.container).not.toHaveTextContent(SIGN_IN);
    uploading.settle({ ok: true, path: TEST_UPLOAD_PATH });
    await screen.findByText("Uploaded brief.pdf.");
    expect(upload.container).not.toHaveTextContent(SIGN_IN);
  });

  it("says nothing about signing in without an upload service", async () => {
    const { container } = await renderField({ uploader: fakeUploader({ availability: "unconfigured", isSignedIn: false }) });

    expect(container).not.toHaveTextContent(/sign in|Drop a file here/i);
  });

  it("is a group named by its label", async () => {
    await renderField({ label: "Attachment" });

    expect(screen.getByRole("group", { name: "Attachment" })).toBeInTheDocument();
  });

  it("names the visible file-picker button by the field's label, also after a remount", async () => {
    const upload = vi.fn(() => Promise.resolve(failure.uploadFailed("network")));
    const { input } = await renderField({ label: "Attachment", uploader: fakeUploader({ upload }) });

    expect(screen.getByRole("button", { name: "Attachment" })).toBeInTheDocument();
    choose(input, testPdf());
    await screen.findByText(failure.uploadFailed("network").message);
    expect(screen.getByRole("button", { name: "Attachment" })).toBeInTheDocument();
  });

  it("keeps describing the file-picker button by the status line after the dropzone remounts", async () => {
    const user = userEvent.setup();
    const results: UploadResult[] = [failure.uploadFailed("network"), { ok: true, path: TEST_UPLOAD_PATH }];
    const upload = vi.fn(() => Promise.resolve(results.shift() ?? failure.uploadFailed("network")));
    const { container } = await renderField({ uploader: fakeUploader({ isSignedIn: false, upload }) });
    const picker = () => screen.getByRole("button", { name: "Primary document" });
    const input = () => {
      const current = container.querySelector<HTMLInputElement>('input[type="file"]');
      if (current === null) throw new Error("The field has no file input.");
      return current;
    };

    choose(input(), testPdf());
    await screen.findByText(failure.uploadFailed("network").message);
    expect(picker()).toHaveAccessibleDescription(failure.uploadFailed("network").message);

    choose(input(), testPdf());
    await screen.findByText("Uploaded brief.pdf.");
    expect(picker()).toHaveAccessibleDescription("Uploaded brief.pdf.");

    await user.click(screen.getByRole("button", { name: "Remove file" }));
    expect(picker()).toHaveAccessibleDescription(
      "Drop a file here or click to select one. PDF, image or text, up to 20 MB. Your wallet will ask you to sign in before the first upload.",
    );
  });

  it("gives the file-picker button no description without an upload service, and one once the service is ready", async () => {
    const { rerenderWith } = await renderField({ uploader: fakeUploader({ availability: "unconfigured", isSignedIn: false }) });
    expect(screen.getByRole("button", { name: "Primary document" })).not.toHaveAttribute("aria-describedby");

    rerenderWith(fakeUploader({ isSignedIn: false }));

    expect(screen.getByRole("button", { name: "Primary document" })).toHaveAccessibleDescription(
      "Drop a file here or click to select one. PDF, image or text, up to 20 MB. Your wallet will ask you to sign in before the first upload.",
    );
  });

  it("shows Uploading to IPFS... during the upload and the file name afterwards", async () => {
    const upload = pendingUpload();
    const uploader = fakeUploader({ phase: "uploading", upload: () => upload.promise });
    const onUploaded = vi.fn();
    const { input } = await renderField({ uploader, onUploaded });
    const file = testPdf();

    choose(input, file);

    expect(await screen.findByText("Uploading to IPFS...")).toBeInTheDocument();
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    expect(uploader.upload).toHaveBeenCalledWith(file, "evidence");
    upload.settle({ ok: true, path: TEST_UPLOAD_PATH });

    expect(await screen.findByText("Uploaded brief.pdf.")).toBeInTheDocument();
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledWith(UPLOADED);
  });

  it("ignores another file while an upload is in progress", async () => {
    const upload = pendingUpload();
    const uploader = fakeUploader({ upload: () => upload.promise });
    const { input } = await renderField({ uploader });

    choose(input, testPdf());
    await screen.findByText("Uploading to IPFS...");
    choose(input, testPdf("other.pdf"));

    expect(uploader.upload).toHaveBeenCalledTimes(1);
  });

  it("shows a refused upload and attaches nothing", async () => {
    const onUploaded = vi.fn();
    const uploader = fakeUploader({ upload: () => Promise.resolve(failure.notContentAddressed()) });
    const { input } = await renderField({ uploader, onUploaded });

    choose(input, testPdf());

    expect(await screen.findByText(failure.notContentAddressed().message)).toBeInTheDocument();
    expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("shows an upload that throws instead of losing it", async () => {
    const uploader = fakeUploader({ upload: () => Promise.reject(new Error("Network down")) });
    const { input } = await renderField({ uploader });

    choose(input, testPdf());

    expect(await screen.findByText("An error occurred while uploading the file. Please try again. (Network down)")).toBeInTheDocument();
  });

  it("locks the field without Atlas, with no status line, and ignores picks", async () => {
    const uploader = fakeUploader({ availability: "unconfigured", isSignedIn: false, limits: () => null });
    const { input, container } = await renderField({ uploader, initial: { path: TEST_UPLOAD_PATH, fileName: "rules.pdf" } });

    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Primary document" })).toBeDisabled();
    expect(input.closest("fieldset")?.parentElement).toHaveClass(...LOCKED_LOOK);
    choose(input, testPdf());

    expect(container).not.toHaveTextContent(/unavailable|Drop a file here/i);
    expect(screen.queryByRole("button", { name: "Connect wallet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove file" })).toBeNull();
    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it("looks disabled and is unreachable while the form locks it", async () => {
    const { input, uploader, container } = await renderField({ isDisabled: true });

    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Primary document" })).toBeDisabled();
    expect(container.querySelector("[data-disabled]")).not.toBeNull();
    expect(input.closest("fieldset")?.parentElement).toHaveClass(...LOCKED_LOOK);
    choose(input, testPdf());

    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it("says that uploading needs a wallet while locked without one", async () => {
    const withoutWallet = await renderField({ isDisabled: true, connect: false });
    expect(screen.getByText("Connect a wallet to upload files.")).toBeInTheDocument();
    withoutWallet.unmount();

    await renderField({ isDisabled: true });

    expect(screen.getByText("Drop a file here or click to select one. PDF, image or text, up to 20 MB.")).toBeInTheDocument();
    expect(screen.queryByText("Connect a wallet to upload files.")).not.toBeInTheDocument();
  });

  it("says why it is locked instead of inviting a drop when the form gives a reason, such as a wallet on another chain", async () => {
    const reason = "Your wallet is on Sepolia, but this page is on Ethereum. Switch your wallet to Ethereum to continue.";
    const { container } = await renderField({ isDisabled: true, lockedReason: reason });

    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/Drop a file here/);
  });

  it("keeps inviting a drop when a reason is given but the field is not locked", async () => {
    await renderField({ lockedReason: "Switch your wallet to Ethereum to continue." });

    expect(screen.getByText("Drop a file here or click to select one. PDF, image or text, up to 20 MB.")).toBeInTheDocument();
    expect(screen.queryByText("Switch your wallet to Ethereum to continue.")).not.toBeInTheDocument();
  });

  it("empties the field when the form resets the controlled value", async () => {
    const user = userEvent.setup();
    await renderField({ initial: UPLOADED });
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset form" }));

    expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("Drop a file here or click to select one. PDF, image or text, up to 20 MB.")).toBeInTheDocument();
  });

  it("clears the attachment with Remove file", async () => {
    const user = userEvent.setup();
    const onCleared = vi.fn();
    await renderField({ initial: UPLOADED, onCleared });

    await user.click(screen.getByRole("button", { name: "Remove file" }));

    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove file" })).not.toBeInTheDocument();
  });

  it("replaces the attached file when another one is chosen", async () => {
    const onCleared = vi.fn();
    const onUploaded = vi.fn();
    const { input } = await renderField({ initial: UPLOADED, onCleared, onUploaded });

    choose(input, testPdf("replacement.pdf"));

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith({ path: TEST_UPLOAD_PATH, fileName: "replacement.pdf" });
    });
    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(screen.getByText("replacement.pdf")).toBeInTheDocument();
  });

  it("offers Connect when the upload needs a wallet", async () => {
    const user = userEvent.setup();
    const wallet = createTestWallet();
    const uploader = fakeUploader({ isSignedIn: false, upload: () => Promise.resolve(failure.noWallet()) });
    const { input } = await renderField({ wallet, connect: false, uploader });

    choose(input, testPdf());
    await user.click(await screen.findByRole("button", { name: "Connect wallet" }));

    expect(screen.getByText("Connect a wallet to upload files.")).toBeInTheDocument();
    expect(wallet.modal?.openConnect).toHaveBeenCalledTimes(1);
  });

  it("never renders the uploaded file", async () => {
    const image = new File([new Uint8Array([137, 80, 78, 71])], "photo.png", { type: "image/png" });
    const { input, container } = await renderField();

    choose(input, image);

    expect(await screen.findByText("Uploaded photo.png.")).toBeInTheDocument();
    expect(container.querySelector("img, iframe, object, embed, video, audio, a[href]")).toBeNull();
  });

  it.each([
    ["too large", failure.refused("too-large", TEST_ROLE_LIMITS.evidence)],
    ["of a type that is not allowed", failure.refused("mime-not-allowed", TEST_ROLE_LIMITS.evidence)],
  ])("shakes the dropzone when a file %s is refused, with the shake off under reduced motion", async (_why, refusal) => {
    const uploader = fakeUploader({ upload: () => Promise.resolve(refusal) });
    const { input, container } = await renderField({ uploader });
    expect(dropzone(container).className).not.toContain(SHAKE);

    choose(input, testPdf());

    expect(await screen.findByText(refusal.message)).toBeInTheDocument();
    expect(dropzone(container).className).toContain(SHAKE);
    expect(dropzone(container).className).toContain("motion-reduce:animate-none");
  });

  it.each([
    ["a network failure", failure.uploadFailed("Network down")],
    ["a declined sign-in", failure.signInRejected()],
    ["a missing wallet", failure.noWallet()],
  ])("does not shake the dropzone after %s", async (_why, result) => {
    const uploader = fakeUploader({ upload: () => Promise.resolve(result) });
    const { input, container } = await renderField({ uploader });

    choose(input, testPdf());

    expect(await screen.findByText(result.message)).toBeInTheDocument();
    expect(dropzone(container).className).not.toContain(SHAKE);
  });
});
