import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { TEST_UPLOAD_PATH, TestAtlasProvider, fakeUploader, type FakeUploader } from "../test/atlas";
import { TestDataProvider } from "../test/data";
import { TestWalletProvider, createTestWallet, type TestWallet } from "../test/wallet";
import { AtlasFileField } from "./AtlasFileField";
import { failure } from "./failures";
import type { AtlasFileFieldProps, UploadResult, UploadedFile } from "./types";

const UPLOADED: UploadedFile = { path: TEST_UPLOAD_PATH, fileName: "brief.pdf" };

function pdf(name = "brief.pdf"): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

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

/** A form that owns the field's value, as Create and the evidence modal do, with a reset like D-44's. */
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
}

async function renderField({ uploader = fakeUploader(), wallet = createTestWallet(), ...props }: RenderOptions = {}) {
  await wallet.connect();
  const ui = (children: ReactNode) => (
    <TestDataProvider>
      <TestWalletProvider wallet={wallet}>
        <TestAtlasProvider uploader={uploader}>{children}</TestAtlasProvider>
      </TestWalletProvider>
    </TestDataProvider>
  );
  const view = render(ui(<Harness {...props} />));
  const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("The field has no file input.");
  return { ...view, input, uploader, wallet };
}

function choose(input: HTMLInputElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

describe("AtlasFileField", () => {
  it("D-42: shows the server's size limit and offers the role's types to the file picker", async () => {
    const { input, uploader } = await renderField();

    expect(screen.getByText("Drop a file here or click to select one. Maximum size: 20 MB.")).toBeInTheDocument();
    expect(uploader.limits).toHaveBeenCalledWith("evidence");
    expect(input).toHaveAttribute("accept", "application/pdf,image/*,text/plain");
  });

  it("D-42: without known limits it still invites a file and lets the upload report why it cannot proceed", async () => {
    const upload = vi.fn(() => Promise.resolve(failure.limitsUnavailable()));
    const { input } = await renderField({ uploader: fakeUploader({ limits: () => null, upload }) });

    expect(screen.getByText("Drop a file here or click to select one.")).toBeInTheDocument();
    expect(input).not.toHaveAttribute("accept");
    choose(input, pdf());

    expect(await screen.findByText(failure.limitsUnavailable().message)).toBeInTheDocument();
  });

  it("is a group named by its label", async () => {
    await renderField({ label: "Attachment" });

    expect(screen.getByRole("group", { name: "Attachment" })).toBeInTheDocument();
  });

  it("A11Y-04: the visible file-picker button is named by the field's label, also after a remount", async () => {
    const upload = vi.fn(() => Promise.resolve(failure.uploadFailed("network")));
    const { input } = await renderField({ label: "Attachment", uploader: fakeUploader({ upload }) });

    expect(screen.getByRole("button", { name: "Attachment" })).toBeInTheDocument();
    choose(input, pdf());
    await screen.findByText(failure.uploadFailed("network").message);
    expect(screen.getByRole("button", { name: "Attachment" })).toBeInTheDocument();
  });

  it("D-08: shows Uploading to IPFS... during the upload and the file name afterwards", async () => {
    const upload = pendingUpload();
    const uploader = fakeUploader({ phase: "uploading", upload: () => upload.promise });
    const onUploaded = vi.fn();
    const { input } = await renderField({ uploader, onUploaded });
    const file = pdf();

    choose(input, file);

    expect(await screen.findByText("Uploading to IPFS...")).toBeInTheDocument();
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    expect(uploader.upload).toHaveBeenCalledWith(file, "evidence");
    upload.settle({ ok: true, path: TEST_UPLOAD_PATH });

    expect(await screen.findByText("Uploaded brief.pdf.")).toBeInTheDocument();
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledWith(UPLOADED);
  });

  it("D-52: asks for the wallet signature while signing in", async () => {
    const upload = pendingUpload();
    const { input } = await renderField({ uploader: fakeUploader({ phase: "signing-in", isSignedIn: false, upload: () => upload.promise }) });

    choose(input, pdf());

    expect(await screen.findByText("Sign the message in your wallet to start the upload.")).toBeInTheDocument();
    upload.settle(failure.signInRejected());
    expect(await screen.findByText("Signature declined. Nothing was uploaded.")).toBeInTheDocument();
  });

  it("D-08: ignores another file while an upload is in progress", async () => {
    const upload = pendingUpload();
    const uploader = fakeUploader({ upload: () => upload.promise });
    const { input } = await renderField({ uploader });

    choose(input, pdf());
    await screen.findByText("Uploading to IPFS...");
    choose(input, pdf("other.pdf"));

    expect(uploader.upload).toHaveBeenCalledTimes(1);
  });

  it("B16: shows a refused upload and attaches nothing", async () => {
    const onUploaded = vi.fn();
    const uploader = fakeUploader({ upload: () => Promise.resolve(failure.notContentAddressed()) });
    const { input } = await renderField({ uploader, onUploaded });

    choose(input, pdf());

    expect(await screen.findByText(failure.notContentAddressed().message)).toBeInTheDocument();
    expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("shows an upload that throws instead of losing it", async () => {
    const uploader = fakeUploader({ upload: () => Promise.reject(new Error("Network down")) });
    const { input } = await renderField({ uploader });

    choose(input, pdf());

    expect(await screen.findByText("An error occurred while uploading the file. Please try again. (Network down)")).toBeInTheDocument();
  });

  it("D-21: shows uploads as unavailable on a deployment without Atlas and ignores picks", async () => {
    const uploader = fakeUploader({ availability: "unconfigured", isSignedIn: false, limits: () => null });
    const { input } = await renderField({ uploader });

    choose(input, pdf());

    expect(screen.getByText("Uploads are unavailable on this deployment.")).toBeInTheDocument();
    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it("ignores picks while the form disables it", async () => {
    const { input, uploader } = await renderField({ isDisabled: true });

    choose(input, pdf());

    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it("D-44: a form reset of the controlled value empties the field", async () => {
    const user = userEvent.setup();
    await renderField({ initial: UPLOADED });
    expect(screen.getByText("brief.pdf")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset form" }));

    expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("Drop a file here or click to select one. Maximum size: 20 MB.")).toBeInTheDocument();
  });

  it("D-44: Remove file clears the attachment", async () => {
    const user = userEvent.setup();
    const onCleared = vi.fn();
    await renderField({ initial: UPLOADED, onCleared });

    await user.click(screen.getByRole("button", { name: "Remove file" }));

    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("brief.pdf")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove file" })).not.toBeInTheDocument();
  });

  it("D-44: choosing another file replaces the attached one", async () => {
    const onCleared = vi.fn();
    const onUploaded = vi.fn();
    const { input } = await renderField({ initial: UPLOADED, onCleared, onUploaded });

    choose(input, pdf("replacement.pdf"));

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalledWith({ path: TEST_UPLOAD_PATH, fileName: "replacement.pdf" });
    });
    expect(onCleared).toHaveBeenCalledTimes(1);
    expect(screen.getByText("replacement.pdf")).toBeInTheDocument();
  });

  it("no-wallet: offers Connect when the upload needs a wallet", async () => {
    const user = userEvent.setup();
    const wallet = createTestWallet();
    const uploader = fakeUploader({ isSignedIn: false, upload: () => Promise.resolve(failure.noWallet()) });
    render(
      <TestDataProvider>
        <TestWalletProvider wallet={wallet}>
          <TestAtlasProvider uploader={uploader}>
            <Harness />
          </TestAtlasProvider>
        </TestWalletProvider>
      </TestDataProvider>,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error("The field has no file input.");

    choose(input, pdf());
    await user.click(await screen.findByRole("button", { name: "Connect wallet" }));

    expect(screen.getByText("Connect a wallet to upload files.")).toBeInTheDocument();
    expect(wallet.modal?.openConnect).toHaveBeenCalledTimes(1);
  });

  it("A17: never renders the uploaded file", async () => {
    const image = new File([new Uint8Array([137, 80, 78, 71])], "photo.png", { type: "image/png" });
    const { input, container } = await renderField();

    choose(input, image);

    expect(await screen.findByText("Uploaded photo.png.")).toBeInTheDocument();
    expect(container.querySelector("img, iframe, object, embed, video, audio, a[href]")).toBeNull();
  });
});
